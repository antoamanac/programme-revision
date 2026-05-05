import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Shield, CheckCircle2, AlertTriangle, Info, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { LcbftRecord, VigilanceLevel } from "@shared/schema";

interface LcbftData {
  record: LcbftRecord | null;
  clientName: string;
  exerciseYear: number;
  exerciseStatus: string;
}

const VIGILANCE_LEVELS = [
  { value: "ALLEGEE", label: "Vigilance allégée", description: "Client à faible risque, procédures simplifiées" },
  { value: "NORMALE", label: "Vigilance normale", description: "Procédures standard de connaissance client" },
  { value: "RENFORCEE", label: "Vigilance renforcée", description: "Client à risque élevé, mesures complémentaires" },
];

const CRITERIA_OPTIONS = [
  { id: "pep", label: "Personne politiquement exposée (PPE)", category: "Identité" },
  { id: "country_risk", label: "Pays à risque élevé (GAFI)", category: "Géographique" },
  { id: "complex_structure", label: "Structure complexe ou opaque", category: "Structure" },
  { id: "unusual_activity", label: "Activité inhabituelle ou incohérente", category: "Activité" },
  { id: "cash_intensive", label: "Activité à forte composante espèces", category: "Activité" },
  { id: "third_party", label: "Intervention de tiers non justifiée", category: "Opérations" },
  { id: "origin_funds", label: "Origine des fonds non documentée", category: "Opérations" },
  { id: "inconsistent_profile", label: "Profil économique incohérent", category: "Profil" },
];

export default function LcbftPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isChefMission } = useAuth();

  const { data, isLoading } = useQuery<LcbftData>({
    queryKey: ["/api/exercises", id, "lcbft"],
  });

  const [vigilanceLevel, setVigilanceLevel] = useState<VigilanceLevel>("NORMALE");
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);
  const [justification, setJustification] = useState("");

  useEffect(() => {
    if (data?.record) {
      setVigilanceLevel(data.record.vigilanceLevel);
      setSelectedCriteria(data.record.criteria || []);
      setJustification(data.record.justification || "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/exercises/${id}/lcbft`, {
        vigilanceLevel,
        criteria: selectedCriteria,
        justification,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exercises", id, "lcbft"] });
      toast({ title: "Enregistré", description: "Les informations LCB-FT ont été sauvegardées." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/exercises/${id}/lcbft/validate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exercises", id, "lcbft"] });
      toast({ title: "Validé", description: "L'évaluation LCB-FT a été validée." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de valider.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return <LcbftSkeleton />;
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

  const isLocked = data.exerciseStatus === "LOCKED";
  const isValidated = !!data.record?.validatedAt;
  const isReadOnly = isLocked || isValidated;

  const toggleCriteria = (criteriaId: string) => {
    if (isReadOnly) return;
    setSelectedCriteria((prev) =>
      prev.includes(criteriaId)
        ? prev.filter((c) => c !== criteriaId)
        : [...prev, criteriaId]
    );
  };

  const hasChanges = data.record ? (
    vigilanceLevel !== data.record.vigilanceLevel ||
    JSON.stringify(selectedCriteria.sort()) !== JSON.stringify((data.record.criteria || []).sort()) ||
    justification !== (data.record.justification || "")
  ) : true;

  const canValidate = isChefMission && !isValidated && justification.length > 0;

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
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">LCB-FT</h1>
            {isValidated && (
              <Badge className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Validé
              </Badge>
            )}
            {isLocked && !isValidated && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Verrouillé
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {data.clientName} • Exercice {data.exerciseYear}
          </p>
        </div>
        <div className="flex gap-2">
          {!isReadOnly && (
            <Button
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !hasChanges}
              data-testid="button-save-lcbft"
            >
              {saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          )}
          {canValidate && (
            <Button
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
              data-testid="button-validate-lcbft"
            >
              {validateMutation.isPending ? "Validation..." : "Valider"}
            </Button>
          )}
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Conformément aux obligations de lutte contre le blanchiment et le financement du terrorisme (LCB-FT), 
          évaluez le niveau de vigilance approprié pour ce client.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Niveau de vigilance</CardTitle>
          <CardDescription>
            Sélectionnez le niveau de vigilance adapté au profil de risque du client
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={vigilanceLevel}
            onValueChange={(value) => !isReadOnly && setVigilanceLevel(value as VigilanceLevel)}
            className="space-y-3"
            disabled={isReadOnly}
          >
            {VIGILANCE_LEVELS.map((level) => (
              <div
                key={level.value}
                className={`flex items-start space-x-3 p-3 rounded-md border transition-colors ${
                  vigilanceLevel === level.value
                    ? "border-primary bg-primary/5"
                    : "border-border"
                } ${isReadOnly ? "opacity-70" : "cursor-pointer hover-elevate"}`}
                onClick={() => !isReadOnly && setVigilanceLevel(level.value as VigilanceLevel)}
              >
                <RadioGroupItem
                  value={level.value}
                  id={level.value}
                  className="mt-0.5"
                  data-testid={`radio-vigilance-${level.value.toLowerCase()}`}
                />
                <div className="flex-1">
                  <Label htmlFor={level.value} className="font-medium cursor-pointer">
                    {level.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{level.description}</p>
                </div>
                {level.value === "RENFORCEE" && (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Critères de risque identifiés</CardTitle>
          <CardDescription>
            Cochez les critères de risque applicables à ce client
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {CRITERIA_OPTIONS.map((criteria) => (
              <div
                key={criteria.id}
                className={`flex items-start space-x-3 p-3 rounded-md border transition-colors ${
                  selectedCriteria.includes(criteria.id)
                    ? "border-primary bg-primary/5"
                    : "border-border"
                } ${isReadOnly ? "opacity-70" : "cursor-pointer hover-elevate"}`}
                onClick={() => toggleCriteria(criteria.id)}
              >
                <Checkbox
                  id={criteria.id}
                  checked={selectedCriteria.includes(criteria.id)}
                  onCheckedChange={() => toggleCriteria(criteria.id)}
                  disabled={isReadOnly}
                  data-testid={`checkbox-criteria-${criteria.id}`}
                />
                <div className="flex-1">
                  <Label htmlFor={criteria.id} className="text-sm cursor-pointer">
                    {criteria.label}
                  </Label>
                  <Badge variant="outline" className="text-[10px] mt-1">{criteria.category}</Badge>
                </div>
              </div>
            ))}
          </div>

          {selectedCriteria.length > 0 && (
            <div className="mt-4 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {selectedCriteria.length} critère{selectedCriteria.length > 1 ? "s" : ""} de risque identifié{selectedCriteria.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Justification et conclusion</CardTitle>
          <CardDescription>
            Documentez votre analyse et les mesures prises
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Décrivez l'analyse réalisée, les documents obtenus et les mesures de vigilance appliquées..."
            className="min-h-[150px]"
            disabled={isReadOnly}
            data-testid="textarea-justification"
          />
          {!justification && !isReadOnly && (
            <p className="text-xs text-muted-foreground mt-2">
              La justification est obligatoire pour valider l'évaluation LCB-FT
            </p>
          )}
        </CardContent>
      </Card>

      {isValidated && data.record?.validatedAt && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-green-600 dark:text-green-400">Évaluation validée</p>
                <p className="text-xs text-muted-foreground">
                  Le {new Date(data.record.validatedAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LcbftSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
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
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
