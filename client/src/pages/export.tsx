import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Loader2, CheckCircle2, Calendar, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import type { ExerciseWithClient, CycleWithProgress } from "@shared/schema";

interface ExportData {
  exercise: ExerciseWithClient;
  previousExports: { id: string; createdAt: string; filename: string }[];
}

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [selectedCycles, setSelectedCycles] = useState<string[]>([]);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [includeLcbft, setIncludeLcbft] = useState(true);

  const { data, isLoading } = useQuery<ExportData>({
    queryKey: ["/api/exercises", id, "export-preview"],
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/exercises/${id}/export`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          cycleIds: selectedCycles.length > 0 ? selectedCycles : undefined,
          includeAttachments,
          includeLcbft,
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `programme-revision-${data?.exercise.client.name}-${data?.exercise.year}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return true;
    },
    onSuccess: () => {
      toast({ title: "Export réussi", description: "Le PDF a été téléchargé." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de générer le PDF.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return <ExportSkeleton />;
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">Exercice introuvable</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/clients">Retour aux clients</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { exercise, previousExports } = data;
  const allCycleIds = exercise.cycles?.map((c) => c.id) || [];

  const toggleCycle = (cycleId: string) => {
    setSelectedCycles((prev) =>
      prev.includes(cycleId)
        ? prev.filter((id) => id !== cycleId)
        : [...prev, cycleId]
    );
  };

  const toggleAllCycles = () => {
    if (selectedCycles.length === allCycleIds.length) {
      setSelectedCycles([]);
    } else {
      setSelectedCycles(allCycleIds);
    }
  };

  const totalQuestions = exercise.cycles?.reduce((acc, c) => acc + c.totalQuestions, 0) || 0;
  const answeredQuestions = exercise.cycles?.reduce((acc, c) => acc + c.answeredQuestions, 0) || 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon" data-testid="button-back">
          <Link href={`/exercises/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Export PDF</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {exercise.client.name} • Exercice {exercise.year}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aperçu du document</CardTitle>
          <CardDescription>Le PDF généré contiendra les informations suivantes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Client</p>
                <p className="text-sm font-medium">{exercise.client.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Exercice</p>
                <p className="text-sm font-medium">{exercise.year}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Questions</p>
                <p className="text-sm font-medium">{answeredQuestions}/{totalQuestions}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Cycles à inclure</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAllCycles}
                data-testid="button-toggle-all-cycles"
              >
                {selectedCycles.length === allCycleIds.length ? "Désélectionner tout" : "Sélectionner tout"}
              </Button>
            </div>
            <div className="space-y-2">
              {exercise.cycles?.sort((a, b) => a.order - b.order).map((cycle) => (
                <CycleExportRow
                  key={cycle.id}
                  cycle={cycle}
                  selected={selectedCycles.length === 0 || selectedCycles.includes(cycle.id)}
                  onToggle={() => toggleCycle(cycle.id)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedCycles.length === 0
                ? "Tous les cycles seront inclus"
                : `${selectedCycles.length} cycle(s) sélectionné(s)`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Options d'export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="attachments"
              checked={includeAttachments}
              onCheckedChange={(checked) => setIncludeAttachments(!!checked)}
              data-testid="checkbox-include-attachments"
            />
            <Label htmlFor="attachments" className="text-sm">
              Inclure la liste des pièces jointes
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="lcbft"
              checked={includeLcbft}
              onCheckedChange={(checked) => setIncludeLcbft(!!checked)}
              data-testid="checkbox-include-lcbft"
            />
            <Label htmlFor="lcbft" className="text-sm">
              Inclure l'évaluation LCB-FT
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Générer le PDF</p>
              <p className="text-sm text-muted-foreground">
                Document PDF structuré avec signatures et visas
              </p>
            </div>
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              data-testid="button-export-pdf"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Exporter PDF
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {previousExports && previousExports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exports précédents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {previousExports.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{exp.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(exp.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CycleExportRow({
  cycle,
  selected,
  onToggle,
}: {
  cycle: CycleWithProgress;
  selected: boolean;
  onToggle: () => void;
}) {
  const progress = cycle.totalQuestions > 0 ? Math.round((cycle.answeredQuestions / cycle.totalQuestions) * 100) : 0;
  const hasChefApproval = !!cycle.chefMissionApproval;
  const hasExpertApproval = !!cycle.expertComptableApproval;

  return (
    <div
      className={`flex items-center space-x-3 p-3 rounded-md border transition-colors cursor-pointer ${
        selected ? "border-primary bg-primary/5" : "border-border"
      }`}
      onClick={onToggle}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} data-testid={`checkbox-cycle-${cycle.id}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{cycle.name}</span>
          {hasExpertApproval && (
            <Badge variant="default" className="text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Validé
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {cycle.answeredQuestions}/{cycle.totalQuestions} questions • {progress}% complété
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {hasChefApproval && (
          <Badge variant="secondary" className="text-[10px]">CM</Badge>
        )}
        {hasExpertApproval && (
          <Badge variant="secondary" className="text-[10px]">EC</Badge>
        )}
      </div>
    </div>
  );
}

function ExportSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </div>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
