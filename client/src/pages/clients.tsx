import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Plus, Search, MoreHorizontal, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Client } from "@shared/schema";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Client>) => {
      return apiRequest("POST", "/api/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setIsDialogOpen(false);
      toast({ title: "Client créé", description: "Le client a été ajouté avec succès." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de créer le client.", variant: "destructive" });
    },
  });

  const filteredClients = clients?.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.siret?.includes(search)
  ) || [];

  if (isLoading) {
    return <ClientsSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground">Gérez vos dossiers clients</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-client">
              <Plus className="mr-2 h-4 w-4" />
              Nouveau client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <CreateClientForm
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou SIRET..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-clients"
          />
        </div>
      </div>

      {filteredClients.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <EmptyState
          hasSearch={search.length > 0}
          onCreateClick={() => setIsDialogOpen(true)}
        />
      )}
    </div>
  );
}

function ClientCard({ client }: { client: Client }) {
  return (
    <Link href={`/clients/${client.id}`}>
      <Card className="hover-elevate cursor-pointer h-full" data-testid={`client-card-${client.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{client.name}</CardTitle>
                {client.siret && (
                  <CardDescription className="text-xs">SIRET: {client.siret}</CardDescription>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0" data-testid={`button-client-menu-${client.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <FileText className="mr-2 h-4 w-4" />
                  Voir les exercices
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Calendar className="mr-2 h-4 w-4" />
                  Nouvel exercice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {client.address && (
            <p className="text-xs text-muted-foreground truncate">{client.address}</p>
          )}
          {client.notes && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{client.notes}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function CreateClientForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: Partial<Client>) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: "",
    siret: "",
    address: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Nouveau client</DialogTitle>
        <DialogDescription>
          Ajoutez un nouveau client à votre portefeuille
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Nom du client *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Société ABC"
            required
            data-testid="input-client-name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="siret">SIRET</Label>
          <Input
            id="siret"
            value={formData.siret}
            onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
            placeholder="123 456 789 00012"
            data-testid="input-client-siret"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="address">Adresse</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="1 rue de Paris, 75001 Paris"
            data-testid="input-client-address"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Informations complémentaires..."
            data-testid="input-client-notes"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isLoading || !formData.name} data-testid="button-submit-client">
          {isLoading ? "Création..." : "Créer le client"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EmptyState({
  hasSearch,
  onCreateClick,
}: {
  hasSearch: boolean;
  onCreateClick: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <Building2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">
          {hasSearch ? "Aucun résultat" : "Aucun client"}
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
          {hasSearch
            ? "Aucun client ne correspond à votre recherche."
            : "Commencez par créer votre premier client pour démarrer un programme de révision."}
        </p>
        {!hasSearch && (
          <Button onClick={onCreateClick} data-testid="button-empty-create-client">
            <Plus className="mr-2 h-4 w-4" />
            Créer un client
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ClientsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-10 w-10 rounded-md" />
              <Skeleton className="h-5 w-32 mt-2" />
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
