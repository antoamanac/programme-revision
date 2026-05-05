import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Page introuvable</h1>
              <p className="text-sm text-muted-foreground">Erreur 404</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            La page que vous recherchez n'existe pas ou a été déplacée.
          </p>

          <Button asChild variant="outline" className="w-full" data-testid="button-back-home">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour au tableau de bord
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
