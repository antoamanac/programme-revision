import { useState, useCallback, Fragment, useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, CheckCircle2, Lock, Paperclip, Trash2, FileText, AlertTriangle,
  Download, Check, Search, Keyboard, Sparkles, Loader2, CloudOff,
  X, Upload, PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { Cycle, QuestionWithAnswer, Approval, AnswerStatus } from "@shared/schema";

interface CycleWorkspaceData {
  cycle: Cycle;
  questions: QuestionWithAnswer[];
  chefMissionApproval?: Approval;
  expertComptableApproval?: Approval;
  exerciseStatus: string;
  clientName: string;
  exerciseYear: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface StatusOpt {
  value: AnswerStatus;
  label: string;
  shortcut: string;
  light: string;
  dark: string;
  ring: string;
  emoji: string;
}

const STATUS_OPTIONS: StatusOpt[] = [
  { value: "OK",       label: "OK",       shortcut: "1", light: "bg-emerald-500 text-white",  dark: "bg-emerald-600 text-white",  ring: "ring-emerald-500/40", emoji: "✓" },
  { value: "NON",      label: "NON",      shortcut: "2", light: "bg-rose-500 text-white",     dark: "bg-rose-600 text-white",     ring: "ring-rose-500/40",    emoji: "✕" },
  { value: "NA",       label: "N/A",      shortcut: "3", light: "bg-slate-400 text-white",    dark: "bg-slate-500 text-white",    ring: "ring-slate-400/40",   emoji: "—" },
  { value: "NEANT",    label: "Néant",    shortcut: "4", light: "bg-amber-500 text-white",    dark: "bg-amber-600 text-white",    ring: "ring-amber-500/40",   emoji: "∅" },
  { value: "EN_COURS", label: "En cours", shortcut: "5", light: "bg-sky-500 text-white",      dark: "bg-sky-600 text-white",      ring: "ring-sky-500/40",     emoji: "⋯" },
];

const STATUS_PILL_INACTIVE = "bg-muted text-muted-foreground hover:bg-muted/80";

function fireConfetti() {
  if (typeof window === "undefined") return;
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "wow-confetti-piece";
    const dx = (Math.random() - 0.5) * 800;
    const dy = 200 + Math.random() * 400;
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
    el.style.background = colors[i % colors.length];
    el.style.left = `${50 + (Math.random() - 0.5) * 8}%`;
    el.style.animationDelay = `${Math.random() * 200}ms`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
}

export default function CycleWorkspacePage() {
  const { id, cycleId } = useParams<{ id: string; cycleId: string }>();
  const { toast } = useToast();
  const { isChefMission, isExpertComptable, user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeRowIdx, setActiveRowIdx] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const searchRef = useRef<HTMLInputElement>(null);
  const lastProgressRef = useRef(0);

  const { data, isLoading } = useQuery<CycleWorkspaceData>({
    queryKey: ["/api/exercises", id, "cycles", cycleId],
  });

  const updateAnswerMutation = useMutation({
    mutationFn: async ({ questionId, status, observations, visaCM, visaEC }: {
      questionId: string;
      status?: AnswerStatus;
      observations?: string;
      visaCM?: string;
      visaEC?: string;
    }) => {
      setSaveState("saving");
      return apiRequest("PATCH", `/api/questions/${questionId}/answer`, { status, observations, visaCM, visaEC });
    },
    onSuccess: () => {
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["/api/exercises", id, "cycles", cycleId] });
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    },
    onError: () => {
      setSaveState("error");
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (level: "CHEF_MISSION" | "EXPERT_COMPTABLE") => {
      return apiRequest("POST", `/api/cycles/${cycleId}/approve`, { level });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exercises", id, "cycles", cycleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/exercises", id] });
      toast({ title: "Cycle validé", description: "Le visa a été enregistré avec succès." });
    },
    onError: (error: any) => {
      toast({
        title: "Validation impossible",
        description: error.message || "Vérifiez que toutes les conditions sont remplies.",
        variant: "destructive",
      });
    },
  });

  const sortedQuestions = useMemo(() => {
    if (!data) return [] as QuestionWithAnswer[];
    return [...data.questions].sort((a, b) => a.order - b.order);
  }, [data]);

  const filteredQuestions = useMemo(() => {
    if (!search.trim()) return sortedQuestions;
    const q = search.toLowerCase();
    return sortedQuestions.filter(
      (x) => x.label.toLowerCase().includes(q) || (x.answer?.observations || "").toLowerCase().includes(q)
    );
  }, [sortedQuestions, search]);

  const isLocked = !!data?.expertComptableApproval || data?.exerciseStatus === "LOCKED";
  const answeredCount = sortedQuestions.filter((q) => q.answer?.status && q.answer.status !== "PENDING").length;
  const total = sortedQuestions.length;
  const progress = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const pendingIssues = sortedQuestions.filter(
    (q) => (q.answer?.status === "NON" && !q.answer.observations) || !q.answer?.status || q.answer?.status === "PENDING"
  ).length;

  // Confetti when reaching 100%
  useEffect(() => {
    if (progress === 100 && lastProgressRef.current < 100 && total > 0) {
      fireConfetti();
    }
    lastProgressRef.current = progress;
  }, [progress, total]);

  const canApproveChefMission = !!isChefMission && !data?.chefMissionApproval && pendingIssues === 0;
  const canApproveExpertComptable =
    !!isExpertComptable && !!data?.chefMissionApproval && !data?.expertComptableApproval && pendingIssues === 0;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Always-active shortcuts
      if (e.key === "?" && !inField) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if ((e.key === "/" || (e.key === "f" && (e.metaKey || e.ctrlKey))) && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (showHelp) setShowHelp(false);
        if (document.activeElement === searchRef.current) (document.activeElement as HTMLElement).blur();
        return;
      }
      if (inField || showHelp) return;
      if (filteredQuestions.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setActiveRowIdx((i) => Math.min(filteredQuestions.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setActiveRowIdx((i) => Math.max(0, i - 1));
        return;
      }
      // Status shortcut
      const opt = STATUS_OPTIONS.find((o) => o.shortcut === e.key);
      if (opt && !isLocked) {
        e.preventDefault();
        const q = filteredQuestions[activeRowIdx];
        if (q) updateAnswerMutation.mutate({ questionId: q.id, status: opt.value });
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeRowIdx, filteredQuestions, isLocked, showHelp, updateAnswerMutation]);

  // Keep active row in view
  useEffect(() => {
    const q = filteredQuestions[activeRowIdx];
    if (!q) return;
    const el = document.getElementById(`row-${q.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeRowIdx, filteredQuestions]);

  if (isLoading) return <WorkspaceSkeleton />;

  if (!data) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">Cycle introuvable</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/exercises/${id}`}>Retour au navigateur</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { cycle, chefMissionApproval, expertComptableApproval, clientName, exerciseYear } = data;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-background via-background to-muted/30">
      <div className="flex-1 overflow-auto">
        {/* Hero header */}
        <div className="sticky top-0 z-20 wow-glass border-b">
          <div className="px-6 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <Button asChild variant="ghost" size="icon" className="mt-1 shrink-0" data-testid="button-back">
                  <Link href={`/exercises/${id}`}>
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold wow-gradient-text" data-testid="text-cycle-name">
                      {cycle.name}
                    </h1>
                    {isLocked && (
                      <Badge variant="secondary" className="gap-1 wow-bounce-in">
                        <Lock className="h-3 w-3" /> Verrouillé
                      </Badge>
                    )}
                    {progress === 100 && !isLocked && (
                      <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 wow-bounce-in">
                        <PartyPopper className="h-3 w-3" /> Cycle complet
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {clientName} • Exercice {exerciseYear}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <SaveIndicator state={saveState} />
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrer…  /"
                    className="pl-8 h-9 w-56"
                    data-testid="input-search"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Effacer la recherche"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowHelp(true)}
                  className="h-9 w-9"
                  title="Raccourcis clavier (?)"
                  data-testid="button-help"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Animated progress hero */}
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-3 flex-1 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 wow-progress-bar rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 18 }}
                />
              </div>
              <div className="flex items-baseline gap-1 tabular-nums shrink-0">
                <span className="text-2xl font-bold wow-gradient-text" data-testid="text-progress-percent">{progress}%</span>
                <span className="text-xs text-muted-foreground">{answeredCount}/{total}</span>
              </div>
              {pendingIssues > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> {pendingIssues} en suspens
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="p-4">
          <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="grid-table">
                <thead className="bg-muted/40 backdrop-blur sticky top-0 z-10">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="text-left p-3 font-semibold border-b min-w-[380px]">Question</th>
                    <th className="text-center p-3 font-semibold border-b w-12">IS</th>
                    <th className="text-center p-3 font-semibold border-b w-12">BIC</th>
                    <th className="text-center p-3 font-semibold border-b w-12">BNC</th>
                    <th className="text-center p-3 font-semibold border-b min-w-[260px]">État</th>
                    <th className="text-center p-3 font-semibold border-b w-20">Visa CM</th>
                    <th className="text-center p-3 font-semibold border-b w-20">Visa EC</th>
                    <th className="text-left p-3 font-semibold border-b min-w-[220px]">Observations</th>
                    <th className="text-center p-3 font-semibold border-b w-12">PJ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuestions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-muted-foreground">
                        <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Aucune question ne correspond à « {search} »
                      </td>
                    </tr>
                  )}
                  {filteredQuestions.map((question, idx) => (
                    <GridRow
                      key={question.id}
                      question={question}
                      rowIndex={idx}
                      isActive={idx === activeRowIdx}
                      onActivate={() => setActiveRowIdx(idx)}
                      isLocked={isLocked}
                      onUpdate={(updates) =>
                        updateAnswerMutation.mutate({ questionId: question.id, ...updates })
                      }
                      exerciseId={id!}
                      isChefMission={!!isChefMission}
                      isExpertComptable={!!isExpertComptable}
                      userName={user?.name || ""}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer hints */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span><kbd className="wow-kbd">↑</kbd>/<kbd className="wow-kbd">↓</kbd> naviguer</span>
            <span>·</span>
            <span><kbd className="wow-kbd">1</kbd>–<kbd className="wow-kbd">5</kbd> définir le statut</span>
            <span>·</span>
            <span><kbd className="wow-kbd">/</kbd> rechercher</span>
            <span>·</span>
            <span><kbd className="wow-kbd">?</kbd> aide</span>
          </div>
        </div>
      </div>

      {/* Side panel */}
      <div className="w-72 border-l border-border bg-muted/20 p-4 overflow-auto shrink-0">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Progression
            </h3>
            <div className="relative h-32 flex items-center justify-center">
              <CircularProgress value={progress} />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              {answeredCount} sur {total} questions répondues
            </p>
          </div>

          {pendingIssues > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
            >
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">{pendingIssues} points en suspens</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Réponses manquantes ou NON sans observation
              </p>
            </motion.div>
          )}

          <Separator />

          <div>
            <h3 className="font-semibold mb-3">Visas du cycle</h3>
            <div className="space-y-3">
              <ApprovalCard
                title="Chef de Mission"
                approval={chefMissionApproval}
                canApprove={canApproveChefMission}
                onApprove={() => approveMutation.mutate("CHEF_MISSION")}
                isLoading={approveMutation.isPending}
              />
              <ApprovalCard
                title="Expert-Comptable"
                approval={expertComptableApproval}
                canApprove={canApproveExpertComptable}
                onApprove={() => approveMutation.mutate("EXPERT_COMPTABLE")}
                isLoading={approveMutation.isPending}
                requiresChefApproval={!chefMissionApproval}
              />
            </div>
          </div>

          {isLocked && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
            >
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Lock className="h-4 w-4" />
                <span className="text-sm font-medium">Cycle verrouillé</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Les réponses ne peuvent plus être modifiées
              </p>
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>{showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}</AnimatePresence>
    </div>
  );
}

/* ----------------------------- Grid row ----------------------------- */

function GridRow({
  question,
  rowIndex,
  isActive,
  onActivate,
  isLocked,
  onUpdate,
  exerciseId,
  isChefMission,
  isExpertComptable,
  userName,
}: {
  question: QuestionWithAnswer;
  rowIndex: number;
  isActive: boolean;
  onActivate: () => void;
  isLocked: boolean;
  onUpdate: (updates: { status?: AnswerStatus; observations?: string; visaCM?: string; visaEC?: string }) => void;
  exerciseId: string;
  isChefMission: boolean;
  isExpertComptable: boolean;
  userName: string;
}) {
  const [localObservations, setLocalObservations] = useState(question.answer?.observations || "");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropping, setIsDropping] = useState(false);

  useEffect(() => {
    setLocalObservations(question.answer?.observations || "");
  }, [question.answer?.observations]);

  const status = question.answer?.status || "PENDING";
  const visaCM = question.answer?.visaCM || "";
  const visaEC = question.answer?.visaEC || "";
  const requiresObservation = status === "NON" && !localObservations;

  const handleObservationsBlur = useCallback(() => {
    if (localObservations !== (question.answer?.observations || "")) {
      onUpdate({ observations: localObservations });
    }
  }, [localObservations, question.answer?.observations, onUpdate]);

  const initials = userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 3);

  const handleVisaCMClick = useCallback(() => {
    if (isLocked || !isChefMission) return;
    onUpdate({ visaCM: visaCM ? "" : initials || "CM" });
  }, [isLocked, isChefMission, visaCM, initials, onUpdate]);

  const handleVisaECClick = useCallback(() => {
    if (isLocked || !isExpertComptable) return;
    onUpdate({ visaEC: visaEC ? "" : initials || "EC" });
  }, [isLocked, isExpertComptable, visaEC, initials, onUpdate]);

  const uploadFile = async (file: File) => {
    setIsDropping(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/questions/${question.id}/attachments`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/exercises", exerciseId] });
    } finally {
      setIsDropping(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    if (isLocked) return;
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    if (isLocked) return;
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const rowClasses = [
    "border-b transition-all duration-200 group",
    isActive ? "wow-row-active" : "hover:bg-muted/30",
    requiresObservation ? "bg-amber-50/40 dark:bg-amber-900/5" : "",
    isDragging ? "wow-drop-zone" : "",
  ].join(" ");

  return (
    <tr
      id={`row-${question.id}`}
      className={rowClasses}
      data-testid={`grid-row-${question.id}`}
      onClick={onActivate}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <td className="p-3 align-top">
        <div className="flex gap-2">
          <span className="text-muted-foreground tabular-nums w-6 shrink-0 text-right">{question.order}.</span>
          <span className="leading-snug">{question.label}</span>
        </div>
        {isDragging && (
          <div className="mt-1 text-xs text-primary flex items-center gap-1">
            <Upload className="h-3 w-3" /> Déposez le fichier ici
          </div>
        )}
      </td>
      {[question.appliesToIS, question.appliesToBIC, question.appliesToBNC].map((on, i) => (
        <td key={i} className="text-center p-2 align-middle">
          {on ? (
            <div className="w-5 h-5 mx-auto rounded border border-primary/30 flex items-center justify-center bg-primary/10 text-primary">
              <Check className="h-3 w-3" />
            </div>
          ) : (
            <div className="w-5 h-5 mx-auto" />
          )}
        </td>
      ))}
      <td className="p-2 align-middle">
        <StatusPills value={status} disabled={isLocked} onChange={(v) => onUpdate({ status: v })} questionId={question.id} />
      </td>
      <td className="text-center p-2 align-middle">
        <VisaButton
          value={visaCM}
          onClick={handleVisaCMClick}
          disabled={isLocked || !isChefMission}
          tone="emerald"
          testId={`visa-cm-${question.id}`}
        />
      </td>
      <td className="text-center p-2 align-middle">
        <VisaButton
          value={visaEC}
          onClick={handleVisaECClick}
          disabled={isLocked || !isExpertComptable}
          tone="sky"
          testId={`visa-ec-${question.id}`}
        />
      </td>
      <td className="p-2 align-middle">
        <Input
          value={localObservations}
          onChange={(e) => setLocalObservations(e.target.value)}
          onBlur={handleObservationsBlur}
          onFocus={onActivate}
          placeholder={status === "NON" ? "Obligatoire…" : "Ajouter une observation…"}
          disabled={isLocked}
          className={`h-8 text-xs transition-colors ${requiresObservation ? "border-amber-500 ring-1 ring-amber-500/30" : ""}`}
          data-testid={`input-observations-${question.id}`}
        />
      </td>
      <td className="text-center p-2 align-middle">
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              disabled={isLocked}
              data-testid={`button-attachments-${question.id}`}
            >
              {isDropping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {question.attachments && question.attachments.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center wow-bounce-in">
                  {question.attachments.length}
                </span>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <AttachmentDialog
              questionId={question.id}
              attachments={question.attachments || []}
              isLocked={isLocked}
              exerciseId={exerciseId}
            />
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  );
}

/* ----------------------------- Status pills ----------------------------- */

function StatusPills({
  value,
  onChange,
  disabled,
  questionId,
}: {
  value: AnswerStatus;
  onChange: (v: AnswerStatus) => void;
  disabled: boolean;
  questionId: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Statut de la question"
      className="flex items-center justify-center gap-1"
      data-testid={`status-group-${questionId}`}
    >
      {STATUS_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${opt.label} (touche ${opt.shortcut})`}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt.value);
            }}
            title={`${opt.label} (${opt.shortcut})`}
            className={[
              "relative h-7 min-w-[2.2rem] px-2 rounded-full text-[11px] font-semibold transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-background",
              active ? `${opt.light} ${opt.ring} shadow-sm scale-105` : STATUS_PILL_INACTIVE,
              disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-105 active:scale-95",
            ].join(" ")}
            data-testid={`status-${opt.value}-${questionId}`}
            data-active={active}
          >
            {active && (
              <motion.span
                layoutId={`pill-bg-${questionId}`}
                className="absolute inset-0 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- Visa button ----------------------------- */

function VisaButton({
  value,
  onClick,
  disabled,
  tone,
  testId,
}: {
  value: string;
  onClick: () => void;
  disabled: boolean;
  tone: "emerald" | "sky";
  testId: string;
}) {
  const toneCls =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
      : "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/40";
  return (
    <button
      type="button"
      aria-pressed={!!value}
      aria-label={value ? `Visa ${tone === "emerald" ? "Chef de Mission" : "Expert-Comptable"} apposé : ${value}` : `Apposer le visa ${tone === "emerald" ? "Chef de Mission" : "Expert-Comptable"}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      className={[
        "w-full h-8 px-2 text-[11px] font-bold rounded-md border transition-all duration-150",
        value
          ? `${toneCls} shadow-sm`
          : "bg-muted/50 hover:bg-muted text-muted-foreground border-dashed border-border",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:scale-[1.04] active:scale-95",
      ].join(" ")}
      data-testid={testId}
    >
      {value ? <span className="wow-stamp inline-block">{value}</span> : "—"}
    </button>
  );
}

/* ----------------------------- Save indicator ----------------------------- */

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <AnimatePresence mode="wait">
      {state === "saving" && (
        <motion.div
          key="saving"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="status-saving"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Sauvegarde…
        </motion.div>
      )}
      {state === "saved" && (
        <motion.div
          key="saved"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
          data-testid="status-saved"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Tout est sauvé
        </motion.div>
      )}
      {state === "error" && (
        <motion.div
          key="error"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-1.5 text-xs text-rose-600"
        >
          <CloudOff className="h-3.5 w-3.5" />
          Erreur de sauvegarde
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------- Circular progress ----------------------------- */

function CircularProgress({ value }: { value: number }) {
  const radius = 48;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
      <motion.circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke="url(#wow-grad)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
      />
      <defs>
        <linearGradient id="wow-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--chart-3))" />
        </linearGradient>
      </defs>
      <text
        x="60"
        y="60"
        textAnchor="middle"
        dominantBaseline="central"
        transform="rotate(90 60 60)"
        className="fill-foreground font-bold text-xl"
      >
        {value}%
      </text>
    </svg>
  );
}

/* ----------------------------- Help overlay ----------------------------- */

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: ["↑", "↓"], label: "Naviguer entre les questions" },
    { keys: ["1"], label: "Marquer OK" },
    { keys: ["2"], label: "Marquer NON" },
    { keys: ["3"], label: "Marquer N/A" },
    { keys: ["4"], label: "Marquer Néant" },
    { keys: ["5"], label: "Marquer En cours" },
    { keys: ["/"], label: "Focus la barre de recherche" },
    { keys: ["?"], label: "Afficher / masquer cette aide" },
    { keys: ["Esc"], label: "Fermer / défocaliser" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-overlay-title"
        initial={{ scale: 0.92, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 8 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="bg-card border rounded-xl shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        data-testid="help-overlay"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="help-overlay-title" className="text-lg font-semibold flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Raccourcis clavier
          </h2>
          <Button ref={closeRef} variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-sm">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => <kbd key={k} className="wow-kbd">{k}</kbd>)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          Astuce : glissez-déposez un fichier directement sur une ligne pour l'attacher.
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------- Attachments ----------------------------- */

function AttachmentDialog({
  questionId,
  attachments,
  isLocked,
  exerciseId,
}: {
  questionId: string;
  attachments: any[];
  isLocked: boolean;
  exerciseId: string;
}) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/questions/${questionId}/attachments`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/exercises", exerciseId] });
      toast({ title: "Fichier uploadé", description: "La pièce jointe a été ajoutée." });
    } catch {
      toast({ title: "Erreur", description: "Impossible d'uploader le fichier.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Pièces jointes</DialogTitle>
        <DialogDescription>Gérez les documents associés à cette question</DialogDescription>
      </DialogHeader>
      <div className="py-4 space-y-4">
        {attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.filter((a) => !a.deleted).map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                data-testid={`attachment-item-${attachment.id}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm" data-testid={`attachment-name-${attachment.id}`}>{attachment.filename}</span>
                  <Badge variant="outline" className="text-[10px]">{attachment.fileType}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" asChild data-testid={`button-download-${attachment.id}`}>
                    <a href={attachment.path} download target="_blank" rel="noreferrer">
                      <Download className="h-3 w-3" />
                    </a>
                  </Button>
                  {!isLocked && (
                    <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-${attachment.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Paperclip className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Aucune pièce jointe</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Astuce : glissez-déposez un fichier sur la ligne
            </p>
          </div>
        )}
        {!isLocked && (
          <div className="border-t pt-4">
            <Label htmlFor="file-upload" className="block mb-2">Ajouter un fichier</Label>
            <Input
              id="file-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
              onChange={handleUpload}
              disabled={isUploading}
              data-testid="input-file-upload"
            />
            <p className="text-xs text-muted-foreground mt-1">PDF, images ou Excel (max 10MB)</p>
          </div>
        )}
      </div>
    </>
  );
}

/* ----------------------------- Approval card ----------------------------- */

function ApprovalCard({
  title,
  approval,
  canApprove,
  onApprove,
  isLoading,
  requiresChefApproval,
}: {
  title: string;
  approval?: Approval;
  canApprove: boolean;
  onApprove: () => void;
  isLoading: boolean;
  requiresChefApproval?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg border transition-colors ${approval ? "bg-emerald-500/5 border-emerald-500/30" : "bg-muted/40 border-border"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {approval ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
          )}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {approval && (
          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            Validé
          </Badge>
        )}
      </div>
      {!approval && (
        <Button
          size="sm"
          variant="outline"
          onClick={onApprove}
          disabled={!canApprove || isLoading}
          className="w-full mt-2 h-8 text-xs"
          data-testid={`button-approve-${title.toLowerCase().replace(/\s/g, "-")}`}
        >
          {isLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          {requiresChefApproval ? "En attente du Chef" : "Apposer le visa"}
        </Button>
      )}
      {approval && (
        <p className="text-xs text-muted-foreground mt-1">
          Validé {approval.approvedAt ? new Date(approval.approvedAt).toLocaleDateString("fr-FR") : ""}
        </p>
      )}
    </div>
  );
}

/* ----------------------------- Skeleton ----------------------------- */

function WorkspaceSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-12 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <div className="space-y-2 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
