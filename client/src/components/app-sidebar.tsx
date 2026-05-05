import { Link, useLocation } from "wouter";
import { Building2, FileText, LogOut, Users, Shield, Home } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

const mainNavItems = [
  { title: "Tableau de bord", url: "/", icon: Home },
  { title: "Clients", url: "/clients", icon: Building2 },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const roleLabel = user?.role === "EXPERT_COMPTABLE" ? "Expert-Comptable" : "Chef de Mission";
  const roleVariant = user?.role === "EXPERT_COMPTABLE" ? "default" : "secondary";

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Programme de Révision</span>
            <span className="text-xs text-muted-foreground">Cabinet Comptable</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Conformité</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.includes("/lcbft")}>
                  <Link href="/clients" data-testid="link-nav-lcbft">
                    <Shield className="h-4 w-4" />
                    <span>LCB-FT</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {user?.name?.split(" ").map(n => n[0]).join("").toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{user?.name || "Utilisateur"}</span>
            <Badge variant={roleVariant} className="w-fit text-[10px] px-1.5 py-0">
              {roleLabel}
            </Badge>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-2 text-muted-foreground hover-elevate"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
