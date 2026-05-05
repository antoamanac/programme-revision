import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

// In-memory token store for header-based auth (works in iframe contexts
// where third-party cookies are blocked). Token -> { userId, expiresAt }.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
interface TokenRecord {
  userId: string;
  expiresAt: number;
}
const authTokens = new Map<string, TokenRecord>();

function purgeExpiredTokens() {
  const now = Date.now();
  for (const [token, rec] of authTokens) {
    if (rec.expiresAt <= now) authTokens.delete(token);
  }
}
setInterval(purgeExpiredTokens, 60 * 60 * 1000).unref?.();

function issueToken(userId: string): string {
  // Don't revoke other tokens for this user — multiple browsers/devices
  // (and parallel test sessions) must be able to stay logged in
  // simultaneously. Stale tokens are cleaned up by TTL + purge interval.
  const token = randomUUID();
  authTokens.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function getUserIdFromRequest(req: Request): string | undefined {
  if (req.session?.userId) return req.session.userId;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const rec = authTokens.get(token);
    if (!rec) return undefined;
    if (rec.expiresAt <= Date.now()) {
      authTokens.delete(token);
      return undefined;
    }
    return rec.userId;
  }
  return undefined;
}

// Use this in handlers instead of req.session.userId so Bearer-authed
// requests work without forcing a new session row to be persisted.
function actorId(req: Request): string {
  return ((req as any).authUserId as string) || (req.session.userId as string);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + file.originalname);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non autorisé"));
    }
  },
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  // Attach to req without mutating the session — mutating the session
  // would force express-session to persist a fresh row on every Bearer
  // request when the cookie is blocked (iframe context = memory leak).
  (req as any).authUserId = userId;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await storage.seedDefaultData();

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: "Identifiants incorrects" });
      }
      
      const isValidPassword = user.password.startsWith("$2") 
        ? await bcrypt.compare(password, user.password)
        : user.password === password;
      
      if (!isValidPassword) {
        return res.status(401).json({ error: "Identifiants incorrects" });
      }
      
      req.session.userId = user.id;
      const token = issueToken(user.id);
      res.json({ id: user.id, name: user.name, email: user.email, role: user.role, token });
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      authTokens.delete(auth.slice(7));
    }
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "Utilisateur introuvable" });
    }
    
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, username: user.username });
  });

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client introuvable" });
      }
      res.json(client);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    try {
      const client = await storage.createClient(req.body);
      res.status(201).json(client);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/clients/:id/exercises", requireAuth, async (req, res) => {
    try {
      const exercises = await storage.getExercisesByClient(req.params.id);
      res.json(exercises);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/clients/:id/exercises", requireAuth, async (req, res) => {
    try {
      const { year } = req.body;
      const exercise = await storage.createExercise({
        clientId: req.params.id,
        year,
        status: "DRAFT",
      });

      const defaultCycles = [
        { name: "Comportement déontologique", order: 1 },
        { name: "Norme Blanchiment", order: 2 },
        { name: "Régularité Formelle", order: 3 },
        { name: "Dépassement des seuils", order: 4 },
        { name: "Disponibilités", order: 5 },
        { name: "Fournisseurs / Cut-off Achats", order: 6 },
        { name: "Charges externes", order: 7 },
        { name: "Clients / Cut-off Ventes", order: 8 },
        { name: "Personnel", order: 9 },
        { name: "Stocks et en-cours", order: 10 },
        { name: "Immobilisations", order: 11 },
        { name: "Taxes", order: 12 },
        { name: "Capitaux propres", order: 13 },
        { name: "Débiteurs et créditeurs divers", order: 14 },
        { name: "Résultat Fiscal", order: 15 },
        { name: "Bouclage dossier", order: 16 },
        { name: "Rédaction de l'annexe", order: 17 },
      ];

      for (const cycleData of defaultCycles) {
        const cycle = await storage.createCycle({
          exerciseId: exercise.id,
          name: cycleData.name,
          order: cycleData.order,
        });

        const questions = getDefaultQuestions(cycleData.name);
        for (let i = 0; i < questions.length; i++) {
          await storage.createQuestion({
            cycleId: cycle.id,
            label: questions[i],
            order: i + 1,
            active: true,
          });
        }
      }

      res.status(201).json(exercise);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/exercises/:id", requireAuth, async (req, res) => {
    try {
      const exercise = await storage.getExercise(req.params.id);
      if (!exercise) {
        return res.status(404).json({ error: "Exercice introuvable" });
      }
      res.json(exercise);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/exercises/:id/duplicate", requireAuth, async (req, res) => {
    try {
      const exercise = await storage.duplicateExercise(req.params.id);
      res.status(201).json(exercise);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/exercises/:id/cycles/:cycleId", requireAuth, async (req, res) => {
    try {
      const { id, cycleId } = req.params;
      const exercise = await storage.getExercise(id);
      if (!exercise) {
        return res.status(404).json({ error: "Exercice introuvable" });
      }

      const cycle = await storage.getCycle(cycleId);
      if (!cycle) {
        return res.status(404).json({ error: "Cycle introuvable" });
      }

      const questions = await storage.getQuestionsByCycle(cycleId);
      const approvals = await storage.getApprovalsByCycle(cycleId);
      const chefMissionApproval = approvals.find(a => a.level === "CHEF_MISSION");
      const expertComptableApproval = approvals.find(a => a.level === "EXPERT_COMPTABLE");

      res.json({
        cycle,
        questions,
        chefMissionApproval,
        expertComptableApproval,
        exerciseStatus: exercise.status,
        clientName: exercise.client.name,
        exerciseYear: exercise.year,
      });
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/questions/:id/answer", requireAuth, async (req, res) => {
    try {
      const { status, observations, visaCM, visaEC } = req.body;
      
      if (status === "NON" && !observations) {
        const existingAnswer = await storage.getAnswer(req.params.id);
        if (!existingAnswer?.observations) {
          // Only require observation if none exists and we're setting to NON
        }
      }

      const answer = await storage.upsertAnswer(
        req.params.id, 
        status, 
        observations, 
        actorId(req),
        visaCM,
        visaEC
      );

      await storage.createAuditLog({
        entityType: "answer",
        entityId: answer.id,
        action: "update",
        afterJson: JSON.stringify({ status, observations, visaCM, visaEC }),
        actorUserId: actorId(req),
      });

      res.json(answer);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/questions/:id/attachments", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Fichier requis" });
      }

      let answer = await storage.getAnswer(req.params.id);
      if (!answer) {
        answer = await storage.upsertAnswer(req.params.id, "PENDING", null, actorId(req));
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      let fileType: "PDF" | "IMAGE" | "EXCEL" = "PDF";
      if ([".jpg", ".jpeg", ".png"].includes(ext)) fileType = "IMAGE";
      if ([".xlsx", ".xls"].includes(ext)) fileType = "EXCEL";

      const attachment = await storage.createAttachment({
        answerId: answer.id,
        fileType,
        filename: req.file.originalname,
        path: `/api/uploads/${req.file.filename}`,
        uploadedByUserId: actorId(req),
      });

      await storage.createAuditLog({
        entityType: "attachment",
        entityId: attachment.id,
        action: "create",
        afterJson: JSON.stringify({ filename: attachment.filename }),
        actorUserId: actorId(req),
      });

      res.status(201).json(attachment);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/uploads/:filename", requireAuth, (req, res) => {
    const filePath = path.join(process.cwd(), "uploads", req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Fichier introuvable" });
    }
    res.sendFile(filePath);
  });

  app.post("/api/cycles/:id/approve", requireAuth, async (req, res) => {
    try {
      const { level } = req.body;
      const cycleId = req.params.id;
      
      const user = await storage.getUser(actorId(req));
      if (!user) {
        return res.status(401).json({ error: "Utilisateur introuvable" });
      }

      const existingApprovals = await storage.getApprovalsByCycle(cycleId);
      const hasChefApproval = existingApprovals.some(a => a.level === "CHEF_MISSION");
      const hasExpertApproval = existingApprovals.some(a => a.level === "EXPERT_COMPTABLE");

      if (level === "CHEF_MISSION") {
        if (hasChefApproval) {
          return res.status(400).json({ error: "Déjà validé par le Chef de Mission" });
        }
      } else if (level === "EXPERT_COMPTABLE") {
        if (!hasChefApproval) {
          return res.status(400).json({ error: "Visa Chef de Mission requis d'abord" });
        }
        if (hasExpertApproval) {
          return res.status(400).json({ error: "Déjà validé par l'Expert-Comptable" });
        }
        if (user.role !== "EXPERT_COMPTABLE") {
          return res.status(403).json({ error: "Seul l'Expert-Comptable peut valider" });
        }
      }

      const cycle = await storage.getCycle(cycleId);
      if (!cycle) {
        return res.status(404).json({ error: "Cycle introuvable" });
      }

      const questions = await storage.getQuestionsByCycle(cycleId);
      const pendingIssues = questions.filter(q => 
        !q.answer?.status || 
        q.answer.status === "PENDING" || 
        (q.answer.status === "NON" && !q.answer.observations)
      ).length;

      if (pendingIssues > 0) {
        return res.status(400).json({ error: `${pendingIssues} point(s) en suspens à résoudre` });
      }

      const approval = await storage.createApproval({
        cycleId,
        level,
        approvedByUserId: actorId(req),
      });

      await storage.createAuditLog({
        entityType: "approval",
        entityId: approval.id,
        action: "create",
        afterJson: JSON.stringify({ cycleId, level }),
        actorUserId: actorId(req),
      });

      if (level === "EXPERT_COMPTABLE") {
        const exercise = await storage.getExercise(cycle.exerciseId);
        if (exercise?.cycles) {
          const allValidated = exercise.cycles.every(c => 
            c.id === cycleId || c.expertComptableApproval
          );
          if (allValidated) {
            await storage.lockExercise(cycle.exerciseId);
          }
        }
      }

      res.status(201).json(approval);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/exercises/:id/lcbft", requireAuth, async (req, res) => {
    try {
      const exercise = await storage.getExercise(req.params.id);
      if (!exercise) {
        return res.status(404).json({ error: "Exercice introuvable" });
      }

      const record = await storage.getLcbftRecord(req.params.id);

      res.json({
        record,
        clientName: exercise.client.name,
        exerciseYear: exercise.year,
        exerciseStatus: exercise.status,
      });
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.put("/api/exercises/:id/lcbft", requireAuth, async (req, res) => {
    try {
      const { vigilanceLevel, criteria, justification } = req.body;
      const record = await storage.upsertLcbftRecord(req.params.id, {
        vigilanceLevel,
        criteria,
        justification,
      });
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/exercises/:id/lcbft/validate", requireAuth, async (req, res) => {
    try {
      await storage.validateLcbftRecord(req.params.id, actorId(req));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/exercises/:id/export-preview", requireAuth, async (req, res) => {
    try {
      const exercise = await storage.getExercise(req.params.id);
      if (!exercise) {
        return res.status(404).json({ error: "Exercice introuvable" });
      }

      res.json({
        exercise,
        previousExports: [],
      });
    } catch (error) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/exercises/:id/export", requireAuth, async (req, res) => {
    try {
      const exercise = await storage.getExercise(req.params.id);
      if (!exercise) {
        return res.status(404).json({ error: "Exercice introuvable" });
      }

      const html = generatePdfHtml(exercise);
      
      let puppeteer;
      try {
        puppeteer = await import("puppeteer");
      } catch (e) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="programme-revision-${exercise.client.name}-${exercise.year}.html"`);
        return res.send(html);
      }
      
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      });
      await browser.close();
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="programme-revision-${exercise.client.name}-${exercise.year}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF export error:", error);
      res.status(500).json({ error: "Erreur lors de la génération du PDF" });
    }
  });

  return httpServer;
}

function getDefaultQuestions(cycleName: string): string[] {
  const questionsMap: Record<string, string[]> = {
    "Comportement déontologique": [
      "Financièrement, suis-je indépendant de mon client ?",
      "Affectivement, suis-je indépendant de mon client ?",
      "Le dossier de mon client présente-t-il des difficultés techniques insurmontables ?",
      "D'une manière générale, sommes-nous compétent pour traiter ce dossier ?",
      "L'évolution de l'environnement et de la relation est-elle de nature à remettre en cause le maintien de la mission ?",
      "Un programme de travail a-t-il été mis en place pour traiter le dossier ?",
      "Ce programme de travail est-il adapté ?",
      "À l'issue de nos travaux, pouvons-nous penser que les flux financiers existants sont d'origine douteuse ou s'intègrent dans un système de blanchiment ?",
      "Une lettre de mission a-t-elle été signée ?",
    ],
    "Norme Blanchiment": [
      "Avez-vous vérifié l'identité des effectifs et du représentant légal (ou de la personne en contact avec nous sur le dossier) ?",
      "La date de fin de validité de la CNI ou du passeport est-elle renseignée dans le tableau d'avancement ?",
      "En cas d'anomalie sur le registre, une mission de mise à jour a-t-elle été proposée ?",
      "L'organigramme de la société est-il à jour ?",
    ],
    "Régularité Formelle": [
      "Les documents requis sont-ils dans la GED ?",
      "Le seuil pour le CAC et le bilan pédagogique ont-ils été vérifiés ?",
      "Le client est-il informé des obligations réglementaires ?",
      "Une mission juridique de mise à jour du K-BIS a-t-elle été proposée si nécessaire ?",
    ],
    "Dépassement des seuils": [
      "Le dépassement de 2 des 3 seuils pour la nomination CAC obligatoire a-t-il été vérifié ?",
      "Le type de société commerciale (SA, SCA, SNC, SARL, SAS) a-t-il été pris en compte ?",
      "La société est-elle une filiale significative (contrôlée directement ou indirectement) ?",
      "Les seuils en matière sociale ont-ils été vérifiés ?",
      "L'entreprise dépasse-t-elle le seuil de 10 salariés (Versement transport, Délégué du personnel) ?",
      "L'entreprise dépasse-t-elle le seuil de 20 salariés (Règlement intérieur, Cotisation AGEFIPH, Effort construction) ?",
      "L'entreprise dépasse-t-elle le seuil de 50 salariés (Comité d'entreprise, CHSCT) ?",
      "Le régime fiscal appliqué est-il le bon, en fonction du CA ?",
    ],
    "Disponibilités": [
      "Les relevés bancaires sont-ils présents dans la GED ? Si non, la copie de la demande par mail est-elle dans la GED ?",
      "Le tableau d'amortissement correspondant aux emprunts est-il disponible ?",
      "Les échéances non échues et intérêts payés d'avance ont-ils été vérifiés ?",
      "La charge financière de l'exercice est-elle correcte ?",
      "En cas de procédure collective (Sauvegarde, RJ), les sommes avant date d'entrée en procédure ont-elles été isolées ?",
      "Y a-t-il concordance avec l'état des créances ?",
    ],
    "Fournisseurs / Cut-off Achats": [
      "Le client a-t-il fourni les factures non réglées ?",
      "Les factures M+1 et M+2 ont-elles été demandées pour les FNP ?",
      "Les avoirs M+1 et M+2 ont-ils été demandés pour les AAR ?",
      "Les comptes assurance, location, maintenance, publicité ont-ils été analysés pour les CCA ?",
      "En cas de procédure collective, les sommes avant date d'entrée en procédure ont-elles été isolées ?",
      "Y a-t-il concordance avec l'état des créances ?",
    ],
    "Charges externes": [
      "Les règles de déduction TVA sont-elles appliquées correctement ?",
      "Les charges relatives aux véhicules de tourisme ont-elles été vérifiées ?",
      "Y a-t-il une location de véhicule > 1 mois (impact TVS) ?",
      "Un barème kilométrique est-il en place ? Si non, à voir avec le gérant.",
      "Les IK sont interdits en BIC - Ce point a-t-il été vérifié ?",
      "Le véhicule est-il à l'actif/Leasing/LLD du bilan si frais réel ?",
      "La même règle de déduction est-elle utilisée pour tous les véhicules ?",
      "Pour BNC si utilisation mixte VP+VU, l'obligation de faire au réel pour tous les véhicules est-elle respectée ?",
      "Des IK sont-elles comptabilisées (salariés y compris) ?",
    ],
    "Clients / Cut-off Ventes": [
      "Le client a-t-il fourni les factures non réglées ?",
      "Le cadrage Gestion Commerciale / Compta a-t-il été effectué ?",
      "Le CA UE ou Export utilise-t-il les comptes 70695X - 70795x - 70895X ?",
      "La prescription commerciale (5 ans entre professionnels, 2 ans avec particuliers) a-t-elle été vérifiée ?",
      "Les factures M+1 et M+2 ont-elles été demandées pour les FAE ?",
      "Les avoirs M+1 et M+2 ont-ils été demandés pour les AAE ?",
      "En cas de procédure collective, les sommes avant date d'entrée ont-elles été isolées ?",
      "Les factures de vente du client sont-elles établies dans les règles ?",
    ],
    "Personnel": [
      "Existe-t-il un lien familial entre l'un des salariés et l'un des associés ou des dirigeants ?",
      "L'un des salariés est-il aussi associé de l'entreprise ?",
      "Si OUI, un dossier a-t-il été monté auprès de Pôle Emploi pour s'assurer de la prise en charge chômage ?",
      "En cas de procédure collective, les sommes avant date d'entrée ont-elles été isolées ?",
      "Les notes de frais sont-elles comptabilisées dans un compte NDF distinct du compte courant associé ?",
      "La DSI de l'année civile correspond-elle à celle de la même année ?",
      "Le dirigeant valide-t-il ses 4 trimestres ?",
      "Les rémunérations sont-elles correctement reportées dans la liasse BNC ?",
    ],
    "Stocks et en-cours": [
      "La date de prise d'inventaire a-t-elle été communiquée par l'entreprise ?",
      "Cette date a-t-elle été prise en compte pour le contrôle du cut-off ?",
    ],
    "Immobilisations": [
      "Le fichier des immobilisations corporelles et incorporelles est-il à jour ?",
      "Les logiciels, sites internet, etc. sont-ils correctement immobilisés ?",
      "Les équipements neufs d'une durée d'utilisation ≥ 3 ans sont-ils immobilisés ?",
      "Les immobilisations financières sont-elles correctement évaluées ?",
      "Le calcul des provisions a-t-il été contrôlé ?",
      "Les informations relatives à l'annexe sont-elles complètes ?",
    ],
    "Taxes": [
      "La TVA non déductible (essence, entretien, loyers véhicules de tourisme, cadeaux > 69 €TTC, consommation personnelle) a-t-elle été vérifiée ?",
      "La DEB est-elle correctement établie dès le 1er euro pour les livraisons intracom ?",
      "L'entreprise est-elle soumise à la DES ?",
      "L'exonération CFE (artisan EI) a-t-elle été vérifiée ?",
      "Le rôle de CFE (Taxe CMA) a-t-il été vérifié ?",
      "La déclaration 1447 M ou C doit-elle être établie ?",
      "La Taxe Foncière a-t-elle été provisionnée ?",
      "La taxe d'apprentissage a-t-elle été provisionnée ?",
      "La formation continue a-t-elle été provisionnée ?",
      "L'effort construction (attention abattement dégressif sur 3 ans) a-t-il été vérifié ?",
      "La Contribution sur les revenus locatifs (location sans TVA) a-t-elle été vérifiée ?",
      "La DECLOYER a-t-elle été faite ?",
      "En cas de procédure collective, les sommes avant date d'entrée ont-elles été isolées ?",
    ],
    "Capitaux propres": [
      "Les mouvements de capitaux propres (Augmentation K, Cession) sont-ils documentés ?",
      "Les capitaux propres sont-ils devenus inférieurs à la moitié du capital ? (prévenir le service juridique)",
      "Y a-t-il eu distribution de dividendes ?",
      "Le calcul des intérêts déductibles tient-il compte des comptes courants d'associés ?",
      "Les charges mixtes ont-elles été déterminées avec précision (attention à l'incidence TVA) ?",
      "Les prélèvements par l'exploitant ont-ils une incidence TVA ?",
      "Les provisions pour risques et charges sont-elles justifiées ?",
    ],
    "Débiteurs et créditeurs divers": [
      "En cas de procédure collective (Sauvegarde, RJ), les sommes avant date d'entrée ont-elles été isolées ?",
      "Y a-t-il concordance avec l'état des créances ?",
    ],
    "Résultat Fiscal": [
      "Le calcul du résultat fiscal (Sté IS) est-il correct ?",
      "L'étalement sur 3 ans ou l'exonération (reversement TVA) a-t-il été vérifié ?",
      "Le Crédit d'Impôt Compétitivité Emploi (CICE) est-il applicable ?",
      "Le crédit d'impôt apprentissage (apprentis et stagiaires) est-il applicable ?",
      "Le crédit d'impôt métiers d'art est-il applicable ?",
      "Le crédit d'impôt formation du chef d'entreprise est-il applicable ?",
      "Le crédit d'impôt emploi des réservistes est-il applicable ?",
      "Le crédit d'impôt pour adhésion à un groupement de prévention est-il applicable ?",
      "Le crédit d'impôt intéressement est-il applicable ?",
      "Le crédit pour formation des salariés à l'épargne salariale est-il applicable ?",
      "Le crédit d'impôt en faveur de la production d'œuvres phonographiques est-il applicable ?",
      "Le crédit d'impôt en faveur des distributeurs de programmes audiovisuels est-il applicable ?",
      "Le crédit d'impôt audiovisuel est-il applicable ?",
      "Le crédit d'impôt en faveur de la création de jeux vidéos est-il applicable ?",
      "Le crédit d'impôt en faveur du rachat d'une entreprise par ses salariés est-il applicable ?",
      "Le crédit d'impôt en faveur des débitants de tabac est-il applicable ?",
      "Le crédit d'impôt maître restaurateur est-il applicable ?",
      "Le crédit d'impôt pour dépenses de prospection commerciale est-il applicable ?",
      "Le crédit d'impôt nouvelle technologie est-il applicable ?",
      "La réduction d'impôt pour frais de comptabilité est-elle applicable ?",
      "La réduction d'impôt pour souscription au capital des entreprises de presse est-elle applicable ?",
      "Le mécénat d'entreprise est-il applicable ? (Attention si dons > 10 000 € déclaration complémentaire)",
      "Le suivi des investissements éligibles au sur-amortissement fiscal est-il assuré ?",
      "Pour SARL ou EURL IS < 20 salariés : la libération intégrale du capital est-elle vérifiée ?",
      "La détention de 75% du capital par des personnes physiques est-elle respectée ?",
      "Les exonérations de type ZFU, ZRR, ZUS, AFR, BER, entreprises nouvelles sont-elles applicables ?",
    ],
    "Bouclage dossier": [
      "La comparaison avec les exercices précédents et le budget a-t-elle été faite ?",
      "La note de synthèse a-t-elle été jointe par mail (avec copie du résultat fiscal) ?",
      "La conclusion sur la cohérence et vraisemblance des comptes pris dans leur ensemble est-elle établie ?",
      "Les honoraires du cabinet sont-ils réglés ?",
      "Le client respecte-t-il toujours ses obligations en matière de communication de documents ou informations nécessaires ?",
      "Le client respecte-t-il ses obligations légales, réglementaires et conventionnelles ?",
    ],
    "Rédaction de l'annexe": [
      "L'entreprise est-elle une micro-entreprise (dispense d'annexe) sauf si CAC ?",
      "Les événements significatifs de l'année sont-ils mentionnés dans l'annexe ?",
    ],
  };
  
  return questionsMap[cycleName] || [];
}

function generatePdfHtml(exercise: any): string {
  const now = new Date().toLocaleDateString("fr-FR");
  
  let cyclesHtml = "";
  if (exercise.cycles) {
    for (const cycle of exercise.cycles.sort((a: any, b: any) => a.order - b.order)) {
      cyclesHtml += `
        <div style="margin-bottom: 30px; page-break-inside: avoid;">
          <h3 style="background: #f0f0f0; padding: 12px 15px; margin: 0; border-radius: 4px;">${cycle.order}. ${cycle.name}</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <thead>
              <tr>
                <th style="border: 1px solid #ddd; padding: 10px; text-align: left; background: #fafafa; width: 50%;">Question</th>
                <th style="border: 1px solid #ddd; padding: 10px; text-align: center; background: #fafafa; width: 15%;">Statut</th>
                <th style="border: 1px solid #ddd; padding: 10px; text-align: left; background: #fafafa;">Commentaire</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="3" style="border: 1px solid #ddd; padding: 10px; color: #666;">
                  ${cycle.answeredQuestions}/${cycle.totalQuestions} questions répondues (${cycle.totalQuestions > 0 ? Math.round((cycle.answeredQuestions / cycle.totalQuestions) * 100) : 0}%)
                </td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 15px; display: flex; gap: 30px; font-size: 13px;">
            <div style="padding: 8px 15px; background: ${cycle.chefMissionApproval ? '#d4edda' : '#f8f9fa'}; border-radius: 4px;">
              <strong>Visa Chef de Mission:</strong> ${cycle.chefMissionApproval ? '✓ Validé' : '○ En attente'}
            </div>
            <div style="padding: 8px 15px; background: ${cycle.expertComptableApproval ? '#d4edda' : '#f8f9fa'}; border-radius: 4px;">
              <strong>Visa Expert-Comptable:</strong> ${cycle.expertComptableApproval ? '✓ Validé' : '○ En attente'}
            </div>
          </div>
        </div>
      `;
    }
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Programme de Révision - ${exercise.client.name} - ${exercise.year}</title>
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
          font-size: 12px; 
          line-height: 1.6; 
          color: #333;
          margin: 0;
          padding: 0;
        }
        .header-banner {
          background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%);
          color: white;
          padding: 30px 40px;
          margin-bottom: 30px;
        }
        .header-banner h1 {
          margin: 0 0 10px 0;
          font-size: 28px;
          font-weight: 600;
        }
        .header-banner p {
          margin: 0;
          opacity: 0.9;
          font-size: 14px;
        }
        .content { padding: 0 40px 40px 40px; }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 40px;
        }
        .info-box { 
          background: #f8fafc; 
          border: 1px solid #e2e8f0; 
          padding: 20px; 
          border-radius: 8px; 
        }
        .info-box h4 {
          margin: 0 0 12px 0;
          color: #1a365d;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .info-box p {
          margin: 5px 0;
          font-size: 13px;
        }
        .info-box strong { color: #4a5568; }
        h2 {
          color: #1a365d;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 10px;
          margin-top: 40px;
          font-size: 18px;
        }
        .signature-section {
          margin-top: 60px;
          page-break-inside: avoid;
        }
        .signature-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 20px;
        }
        .signature-box {
          text-align: center;
          padding: 30px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .signature-box h4 {
          margin: 0 0 20px 0;
          color: #1a365d;
        }
        .signature-line {
          border-top: 1px solid #333;
          margin-top: 50px;
          padding-top: 10px;
          font-size: 11px;
          color: #666;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          text-align: center;
          font-size: 10px;
          color: #666;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
        }
        .status-locked { background: #d4edda; color: #155724; }
        .status-review { background: #fff3cd; color: #856404; }
        .status-draft { background: #e2e8f0; color: #4a5568; }
      </style>
    </head>
    <body>
      <div class="header-banner">
        <h1>Programme de Révision Comptable</h1>
        <p>Document généré le ${now} • Conformité aux normes professionnelles</p>
      </div>
      
      <div class="content">
        <div class="info-grid">
          <div class="info-box">
            <h4>Informations Client</h4>
            <p><strong>Raison sociale:</strong> ${exercise.client.name}</p>
            <p><strong>SIRET:</strong> ${exercise.client.siret || "Non renseigné"}</p>
            <p><strong>Adresse:</strong> ${exercise.client.address || "Non renseignée"}</p>
          </div>
          <div class="info-box">
            <h4>Informations Exercice</h4>
            <p><strong>Exercice comptable:</strong> ${exercise.year}</p>
            <p>
              <strong>Statut:</strong> 
              <span class="status-badge ${exercise.status === "LOCKED" ? "status-locked" : exercise.status === "IN_REVIEW" ? "status-review" : "status-draft"}">
                ${exercise.status === "LOCKED" ? "Verrouillé" : exercise.status === "IN_REVIEW" ? "En révision" : "Brouillon"}
              </span>
            </p>
            <p><strong>Date de création:</strong> ${new Date(exercise.createdAt).toLocaleDateString("fr-FR")}</p>
          </div>
        </div>

        <h2>Cycles de Révision</h2>
        ${cyclesHtml}

        <div class="signature-section">
          <h2>Signatures et Validations</h2>
          <div class="signature-grid">
            <div class="signature-box">
              <h4>Chef de Mission</h4>
              <p>Nom: _________________________</p>
              <div class="signature-line">Signature et date</div>
            </div>
            <div class="signature-box">
              <h4>Expert-Comptable</h4>
              <p>Nom: _________________________</p>
              <div class="signature-line">Signature et date</div>
            </div>
          </div>
        </div>

        <div class="footer">
          <p>Document confidentiel - Programme de Révision Comptable</p>
          <p>Généré automatiquement par le système de gestion des dossiers de révision</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
