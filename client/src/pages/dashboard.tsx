import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, CheckCircle2, Clock, AlertTriangle, ArrowRight, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { Client, Exercise } from "@shared/schema";

interface DashboardStats {
  totalClients: number;
  totalExercises: number;
  inReview: number;
  locked: number;
  recentExercises: (Exercise & { client: Client; progress: number })[];
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">Vue d'ensemble de vos dossiers de révision</p>
        </div>
        <Button asChild data-testid="button-new-client">
          <Link href="/clients">
            <Building2 className="mr-2 h-4 w-4" />
            Voir les clients
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Clients"
          value={stats?.totalClients || 0}
          description="Dossiers clients actifs"
          icon={Building2}
          testId="stat-clients"
        />
        <StatCard
          title="Exercices"
          value={stats?.totalExercises || 0}
          description="Total des exercices"
          icon={FileText}
          testId="stat-exercises"
        />
        <StatCard
          title="En révision"
          value={stats?.inReview || 0}
          description="Exercices en cours"
          icon={Clock}
          variant="warning"
          testId="stat-in-review"
        />
        <StatCard
          title="Verrouillés"
          value={stats?.locked || 0}
          description="Exercices validés"
          icon={CheckCircle2}
          variant="success"
          testId="stat-locked"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Exercices récents</CardTitle>
            <CardDescription>Derniers dossiers modifiés</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.recentExercises && stats.recentExercises.length > 0 ? (
              <div className="space-y-4">
                {stats.recentExercises.map((exercise) => (
                  <Link
                    key={exercise.id}
                    href={`/exercises/${exercise.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-3 rounded-md border border-border hover-elevate cursor-pointer" data-testid={`exercise-card-${exercise.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{exercise.client.name}</p>
                          <p className="text-xs text-muted-foreground">Exercice {exercise.year}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <Progress value={exercise.progress} className="w-20 h-2" />
                          <p className="text-xs text-muted-foreground mt-1">{exercise.progress}%</p>
                        </div>
                        <StatusBadge status={exercise.status} />
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">Aucun exercice récent</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/clients">Créer un exercice</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Points d'attention</CardTitle>
            <CardDescription>Éléments nécessitant une action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <AttentionItem
                icon={AlertTriangle}
                title="Réponses NON sans commentaire"
                count={0}
                variant="warning"
              />
              <AttentionItem
                icon={Clock}
                title="Cycles en attente de validation CM"
                count={0}
                variant="info"
              />
              <AttentionItem
                icon={CheckCircle2}
                title="Cycles en attente de validation EC"
                count={0}
                variant="success"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  variant = "default",
  testId,
}: {
  title: string;
  value: number;
  description: string;
  icon: typeof Building2;
  variant?: "default" | "warning" | "success";
  testId: string;
}) {
  const variantStyles = {
    default: "bg-primary/10 text-primary",
    warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
  };

  return (
    <Card data-testid={testId}>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${variantStyles[variant]}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    DRAFT: { label: "Brouillon", variant: "secondary" },
    IN_REVIEW: { label: "En révision", variant: "outline" },
    LOCKED: { label: "Verrouillé", variant: "default" },
  };

  const { label, variant } = variants[status] || variants.DRAFT;

  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}

function AttentionItem({
  icon: Icon,
  title,
  count,
  variant,
}: {
  icon: typeof AlertTriangle;
  title: string;
  count: number;
  variant: "warning" | "info" | "success";
}) {
  const variantStyles = {
    warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-md bg-muted/30">
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${variantStyles[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm">{title}</span>
      </div>
      <Badge variant="secondary" className="text-xs">{count}</Badge>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
