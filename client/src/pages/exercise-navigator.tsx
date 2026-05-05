import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle, FileText, Shield, Download, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExerciseWithClient, CycleWithProgress } from "@shared/schema";

export default function ExerciseNavigatorPage() {
  const { id } = useParams<{ id: string }>();

  const { data: exercise, isLoading } = useQuery<ExerciseWithClient>({
    queryKey: ["/api/exercises", id],
  });

  if (isLoading) {
    return <NavigatorSkeleton />;
  }

  if (!exercise) {
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

  const totalQuestions = exercise.cycles?.reduce((acc, c) => acc + c.totalQuestions, 0) || 0;
  const answeredQuestions = exercise.cycles?.reduce((acc, c) => acc + c.answeredQuestions, 0) || 0;
  const pendingIssues = exercise.cycles?.reduce((acc, c) => acc + c.pendingIssues, 0) || 0;
  const overallProgress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  const validatedCycles = exercise.cycles?.filter((c) => c.expertComptableApproval).length || 0;
  const totalCycles = exercise.cycles?.length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon" data-testid="button-back">
          <Link href={`/clients/${exercise.clientId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">PROGRAMME DE RÉVISION</h1>
            <ExerciseStatusBadge status={exercise.status} />
          </div>
          <p className="text-muted-foreground">{exercise.client.name} • Clôture {exercise.year}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" data-testid="button-lcbft">
            <Link href={`/exercises/${id}/lcbft`}>
              <Shield className="mr-2 h-4 w-4" />
              LCB-FT
            </Link>
          </Button>
          <Button asChild data-testid="button-export">
            <Link href={`/exercises/${id}/export`}>
              <Download className="mr-2 h-4 w-4" />
              Exporter PDF
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <ProgressCard
          title="Progression globale"
          value={overallProgress}
          subtitle={`${answeredQuestions}/${totalQuestions} questions`}
          icon={FileText}
        />
        <ProgressCard
          title="Cycles validés"
          value={totalCycles > 0 ? Math.round((validatedCycles / totalCycles) * 100) : 0}
          subtitle={`${validatedCycles}/${totalCycles} cycles`}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="Points en suspens"
          value={pendingIssues}
          subtitle="Réponses NON ou manquantes"
          icon={AlertTriangle}
          variant="warning"
        />
        <StatCard
          title="Statut"
          value={exercise.status === "LOCKED" ? "Verrouillé" : exercise.status === "IN_REVIEW" ? "En révision" : "Brouillon"}
          subtitle={exercise.lockedAt ? `Depuis le ${new Date(exercise.lockedAt).toLocaleDateString("fr-FR")}` : "Modification possible"}
          icon={exercise.status === "LOCKED" ? Lock : Clock}
          variant={exercise.status === "LOCKED" ? "success" : "default"}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Cycles de révision</h2>
        {exercise.cycles && exercise.cycles.length > 0 ? (
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm" data-testid="cycles-table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium border-b w-12">#</th>
                  <th className="text-left p-3 font-medium border-b">Cycle</th>
                  <th className="text-center p-3 font-medium border-b w-24">État</th>
                  <th className="text-center p-3 font-medium border-b w-20">Visa CM</th>
                  <th className="text-center p-3 font-medium border-b w-20">Visa EC</th>
                  <th className="text-center p-3 font-medium border-b w-20">NB ctrl</th>
                  <th className="text-left p-3 font-medium border-b w-48">Points en suspens</th>
                  <th className="text-center p-3 font-medium border-b w-12"></th>
                </tr>
              </thead>
              <tbody>
                {exercise.cycles
                  .sort((a, b) => a.order - b.order)
                  .map((cycle) => (
                    <CycleTableRow 
                      key={cycle.id} 
                      cycle={cycle} 
                      exerciseId={id!} 
                      isLocked={exercise.status === "LOCKED"} 
                    />
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Aucun cycle dans cet exercice</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CycleTableRow({ cycle, exerciseId, isLocked }: { cycle: CycleWithProgress; exerciseId: string; isLocked: boolean }) {
  const [, setLocation] = useLocation();
  const progress = cycle.totalQuestions > 0 ? Math.round((cycle.answeredQuestions / cycle.totalQuestions) * 100) : 0;
  const hasChefApproval = !!cycle.chefMissionApproval;
  const hasExpertApproval = !!cycle.expertComptableApproval;

  const getProgressColor = (p: number) => {
    if (p === 100) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    if (p >= 50) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  };

  const handleRowClick = () => {
    setLocation(`/exercises/${exerciseId}/cycles/${cycle.id}`);
  };

  return (
    <tr 
      className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
      onClick={handleRowClick}
      data-testid={`cycle-row-${cycle.id}`}
    >
      <td className="p-3 text-center font-semibold text-primary">
        {cycle.order}
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{cycle.name}</span>
          {isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
        </div>
      </td>
      <td className="p-3 text-center">
        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getProgressColor(progress)}`}>
          {progress === 100 ? "100%" : `${progress}%`}
        </span>
      </td>
      <td className="p-3 text-center">
        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
          hasChefApproval 
            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
            : "bg-muted text-muted-foreground"
        }`}>
          {hasChefApproval ? "OK" : "-"}
        </span>
      </td>
      <td className="p-3 text-center">
        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
          hasExpertApproval 
            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" 
            : "bg-muted text-muted-foreground"
        }`}>
          {hasExpertApproval ? "OK" : "-"}
        </span>
      </td>
      <td className="p-3 text-center">
        <span className="font-medium">{cycle.totalQuestions}</span>
      </td>
      <td className="p-3">
        {cycle.pendingIssues > 0 ? (
          <span className="text-yellow-600 dark:text-yellow-400 text-xs">
            {cycle.pendingIssues} point(s) en suspens
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">RAS</span>
        )}
      </td>
      <td className="p-3 text-center">
        <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
      </td>
    </tr>
  );
}

function ExerciseStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    DRAFT: { label: "Brouillon", variant: "secondary" },
    IN_REVIEW: { label: "En révision", variant: "outline" },
    LOCKED: { label: "Verrouillé", variant: "default" },
  };

  const { label, variant } = config[status] || config.DRAFT;

  return <Badge variant={variant}>{label}</Badge>;
}

function ProgressCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: typeof FileText;
  variant?: "default" | "success";
}) {
  const colorClass = variant === "success"
    ? "text-green-600 dark:text-green-400"
    : "text-primary";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Icon className={`h-4 w-4 ${colorClass}`} />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold ${colorClass}`}>{value}%</span>
          </div>
          <Progress value={value} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: typeof FileText;
  variant?: "default" | "warning" | "success";
}) {
  const colorClasses = {
    default: "text-foreground",
    warning: "text-yellow-600 dark:text-yellow-400",
    success: "text-green-600 dark:text-green-400",
  };

  const iconBgClasses = {
    default: "bg-muted text-muted-foreground",
    warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBgClasses[variant]}`}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className={`text-xl font-bold ${colorClasses[variant]}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function NavigatorSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
