import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Copy, FileText, MoreHorizontal, Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Client, Exercise } from "@shared/schema";

type ExerciseWithProgress = Exercise & { progress: number };

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: client, isLoading: clientLoading } = useQuery<Client>({
    queryKey: ["/api/clients", id],
  });

  const { data: exercises, isLoading: exercisesLoading } = useQuery<ExerciseWithProgress[]>({
    queryKey: ["/api/clients", id, "exercises"],
  });

  const createMutation = useMutation({
    mutationFn: async (year: number) => {
      return apiRequest("POST", `/api/clients/${id}/exercises`, { year });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "exercises"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Exercice créé", description: "L'exercice a été créé avec le programme de révision par défaut." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de créer l'exercice.", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (sourceExerciseId: string) => {
      return apiRequest("POST", `/api/exercises/${sourceExerciseId}/duplicate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "exercises"] });
      setIsDuplicateDialogOpen(false);
      toast({ title: "Exercice dupliqué", description: "L'exercice a été dupliqué avec succès." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de dupliquer l'exercice.", variant: "destructive" });
    },
  });

  if (clientLoading || exercisesLoading) {
    return <ClientDetailSkeleton />;
  }

  if (!client) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">Client introuvable</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/clients">Retour aux clients</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon" data-testid="button-back">
          <Link href="/clients">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            {client.siret && <span>SIRET: {client.siret}</span>}
            {client.address && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span>{client.address}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {client.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{client.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Exercices</h2>
        <div className="flex gap-2">
          {exercises && exercises.length > 0 && (
            <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-duplicate-exercise">
                  <Copy className="mr-2 h-4 w-4" />
                  Dupliquer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DuplicateExerciseForm
                  exercises={exercises}
                  selectedId={selectedExerciseId}
                  onSelect={setSelectedExerciseId}
                  onSubmit={() => selectedExerciseId && duplicateMutation.mutate(selectedExerciseId)}
                  isLoading={duplicateMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-exercise">
                <Plus className="mr-2 h-4 w-4" />
                Nouvel exercice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <CreateExerciseForm
                onSubmit={(year) => createMutation.mutate(year)}
                isLoading={createMutation.isPending}
                existingYears={exercises?.map((e) => e.year) || []}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {exercises && exercises.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exercises
            .sort((a, b) => b.year - a.year)
            .map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} clientId={client.id} />
            ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">Aucun exercice</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Créez votre premier exercice pour démarrer le programme de révision comptable.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-empty-create-exercise">
              <Plus className="mr-2 h-4 w-4" />
              Créer un exercice
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExerciseCard({ exercise, clientId }: { exercise: ExerciseWithProgress; clientId: string }) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    DRAFT: { label: "Brouillon", variant: "secondary" },
    IN_REVIEW: { label: "En révision", variant: "outline" },
    LOCKED: { label: "Verrouillé", variant: "default" },
  };

  const { label, variant } = statusConfig[exercise.status] || statusConfig.DRAFT;

  return (
    <Link href={`/exercises/${exercise.id}`}>
      <Card className="hover-elevate cursor-pointer h-full" data-testid={`exercise-card-${exercise.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Exercice {exercise.year}</CardTitle>
                <CardDescription className="text-xs">
                  Créé le {new Date(exercise.createdAt).toLocaleDateString("fr-FR")}
                </CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0" data-testid={`button-exercise-menu-${exercise.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <FileText className="mr-2 h-4 w-4" />
                  Voir le programme
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="mr-2 h-4 w-4" />
                  Dupliquer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant={variant} className="text-xs">{label}</Badge>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progression</span>
              <span className="font-medium">{exercise.progress}%</span>
            </div>
            <Progress value={exercise.progress} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CreateExerciseForm({
  onSubmit,
  isLoading,
  existingYears,
}: {
  onSubmit: (year: number) => void;
  isLoading: boolean;
  existingYears: number[];
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));

  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  const availableYears = years.filter((y) => !existingYears.includes(y));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(parseInt(year));
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Nouvel exercice</DialogTitle>
        <DialogDescription>
          Créez un nouvel exercice avec le programme de révision par défaut
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="year">Année de l'exercice</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger data-testid="select-exercise-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isLoading} data-testid="button-submit-exercise">
          {isLoading ? "Création..." : "Créer l'exercice"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DuplicateExerciseForm({
  exercises,
  selectedId,
  onSelect,
  onSubmit,
  isLoading,
}: {
  exercises: ExerciseWithProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Dupliquer un exercice</DialogTitle>
        <DialogDescription>
          Sélectionnez l'exercice à dupliquer. Les cycles et questions seront copiés.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>Exercice source</Label>
          <Select value={selectedId || ""} onValueChange={onSelect}>
            <SelectTrigger data-testid="select-duplicate-source">
              <SelectValue placeholder="Sélectionner un exercice" />
            </SelectTrigger>
            <SelectContent>
              {exercises.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  Exercice {e.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSubmit} disabled={isLoading || !selectedId} data-testid="button-submit-duplicate">
          {isLoading ? "Duplication..." : "Dupliquer"}
        </Button>
      </DialogFooter>
    </>
  );
}

function ClientDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-10 w-10 rounded-md" />
              <Skeleton className="h-5 w-32 mt-2" />
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
