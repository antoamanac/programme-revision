import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users, clients, exercises, cycles, questions, answers, attachments, approvals, lcbftRecords, auditLogs,
  type User, type InsertUser, type Client, type InsertClient, type Exercise, type InsertExercise,
  type Cycle, type InsertCycle, type Question, type InsertQuestion, type Answer, type InsertAnswer,
  type Attachment, type InsertAttachment, type Approval, type InsertApproval,
  type LcbftRecord, type InsertLcbftRecord, type AuditLog, type InsertAuditLog,
  type CycleWithProgress, type QuestionWithAnswer, type ExerciseWithClient
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  
  getExercisesByClient(clientId: string): Promise<(Exercise & { progress: number })[]>;
  getExercise(id: string): Promise<ExerciseWithClient | undefined>;
  createExercise(exercise: InsertExercise): Promise<Exercise>;
  duplicateExercise(exerciseId: string): Promise<Exercise>;
  lockExercise(id: string): Promise<void>;
  
  getCyclesByExercise(exerciseId: string): Promise<CycleWithProgress[]>;
  getCycle(id: string): Promise<Cycle | undefined>;
  createCycle(cycle: InsertCycle): Promise<Cycle>;
  
  getQuestionsByCycle(cycleId: string): Promise<QuestionWithAnswer[]>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  
  getAnswer(questionId: string): Promise<Answer | undefined>;
  upsertAnswer(questionId: string, status: string | undefined, observations: string | null | undefined, userId: string, visaCM?: string, visaEC?: string): Promise<Answer>;
  
  getAttachmentsByAnswer(answerId: string): Promise<Attachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  softDeleteAttachment(id: string): Promise<void>;
  
  getApprovalsByCycle(cycleId: string): Promise<Approval[]>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  
  getLcbftRecord(exerciseId: string): Promise<LcbftRecord | undefined>;
  upsertLcbftRecord(exerciseId: string, data: Partial<InsertLcbftRecord>): Promise<LcbftRecord>;
  validateLcbftRecord(exerciseId: string, userId: string): Promise<void>;
  
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  getDashboardStats(): Promise<{
    totalClients: number;
    totalExercises: number;
    inReview: number;
    locked: number;
    recentExercises: (Exercise & { client: Client; progress: number })[];
  }>;
  
  seedDefaultData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async getExercisesByClient(clientId: string): Promise<(Exercise & { progress: number })[]> {
    const exerciseList = await db.select().from(exercises).where(eq(exercises.clientId, clientId)).orderBy(desc(exercises.year));
    
    const result = await Promise.all(exerciseList.map(async (exercise) => {
      const cycleList = await this.getCyclesByExercise(exercise.id);
      const totalQuestions = cycleList.reduce((acc, c) => acc + c.totalQuestions, 0);
      const answeredQuestions = cycleList.reduce((acc, c) => acc + c.answeredQuestions, 0);
      const progress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
      return { ...exercise, progress };
    }));
    
    return result;
  }

  async getExercise(id: string): Promise<ExerciseWithClient | undefined> {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id));
    if (!exercise) return undefined;
    
    const [client] = await db.select().from(clients).where(eq(clients.id, exercise.clientId));
    if (!client) return undefined;
    
    const cycleList = await this.getCyclesByExercise(id);
    
    return { ...exercise, client, cycles: cycleList };
  }

  async createExercise(exercise: InsertExercise): Promise<Exercise> {
    const [created] = await db.insert(exercises).values(exercise).returning();
    return created;
  }

  async duplicateExercise(exerciseId: string): Promise<Exercise> {
    const source = await this.getExercise(exerciseId);
    if (!source) throw new Error("Exercise not found");
    
    const newYear = source.year + 1;
    const [newExercise] = await db.insert(exercises).values({
      clientId: source.clientId,
      year: newYear,
      status: "DRAFT",
    }).returning();
    
    if (source.cycles) {
      for (const cycle of source.cycles) {
        const [newCycle] = await db.insert(cycles).values({
          exerciseId: newExercise.id,
          name: cycle.name,
          order: cycle.order,
        }).returning();
        
        const questionList = await db.select().from(questions).where(eq(questions.cycleId, cycle.id));
        for (const question of questionList) {
          await db.insert(questions).values({
            cycleId: newCycle.id,
            label: question.label,
            order: question.order,
            active: question.active,
          });
        }
      }
    }
    
    return newExercise;
  }

  async lockExercise(id: string): Promise<void> {
    await db.update(exercises).set({ status: "LOCKED", lockedAt: new Date() }).where(eq(exercises.id, id));
  }

  async getCyclesByExercise(exerciseId: string): Promise<CycleWithProgress[]> {
    const cycleList = await db.select().from(cycles).where(eq(cycles.exerciseId, exerciseId)).orderBy(cycles.order);
    
    const result = await Promise.all(cycleList.map(async (cycle) => {
      const questionList = await db.select().from(questions).where(eq(questions.cycleId, cycle.id));
      const totalQuestions = questionList.length;
      
      let answeredQuestions = 0;
      let pendingIssues = 0;
      
      for (const question of questionList) {
        const [answer] = await db.select().from(answers).where(eq(answers.questionId, question.id));
        if (answer && answer.status !== "PENDING") {
          answeredQuestions++;
        }
        if (!answer || answer.status === "PENDING" || (answer.status === "NON" && !answer.observations)) {
          pendingIssues++;
        }
      }
      
      const approvalList = await this.getApprovalsByCycle(cycle.id);
      const chefMissionApproval = approvalList.find(a => a.level === "CHEF_MISSION");
      const expertComptableApproval = approvalList.find(a => a.level === "EXPERT_COMPTABLE");
      
      return {
        ...cycle,
        totalQuestions,
        answeredQuestions,
        pendingIssues,
        chefMissionApproval,
        expertComptableApproval,
      };
    }));
    
    return result;
  }

  async getCycle(id: string): Promise<Cycle | undefined> {
    const [cycle] = await db.select().from(cycles).where(eq(cycles.id, id));
    return cycle;
  }

  async createCycle(cycle: InsertCycle): Promise<Cycle> {
    const [created] = await db.insert(cycles).values(cycle).returning();
    return created;
  }

  async getQuestionsByCycle(cycleId: string): Promise<QuestionWithAnswer[]> {
    const questionList = await db.select().from(questions).where(eq(questions.cycleId, cycleId)).orderBy(questions.order);
    
    const result = await Promise.all(questionList.map(async (question) => {
      const [answer] = await db.select().from(answers).where(eq(answers.questionId, question.id));
      let attachmentList: Attachment[] = [];
      if (answer) {
        attachmentList = await db.select().from(attachments).where(eq(attachments.answerId, answer.id));
      }
      return { ...question, answer, attachments: attachmentList };
    }));
    
    return result;
  }

  async createQuestion(question: InsertQuestion): Promise<Question> {
    const [created] = await db.insert(questions).values(question).returning();
    return created;
  }

  async getAnswer(questionId: string): Promise<Answer | undefined> {
    const [answer] = await db.select().from(answers).where(eq(answers.questionId, questionId));
    return answer;
  }

  async upsertAnswer(
    questionId: string, 
    status: string | undefined, 
    observations: string | null | undefined, 
    userId: string,
    visaCM?: string,
    visaEC?: string
  ): Promise<Answer> {
    const existing = await this.getAnswer(questionId);
    
    const updateData: any = { updatedByUserId: userId, updatedAt: new Date() };
    if (status !== undefined) updateData.status = status as any;
    if (observations !== undefined) updateData.observations = observations;
    if (visaCM !== undefined) updateData.visaCM = visaCM;
    if (visaEC !== undefined) updateData.visaEC = visaEC;
    
    if (existing) {
      const [updated] = await db.update(answers)
        .set(updateData)
        .where(eq(answers.questionId, questionId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(answers).values({
        questionId,
        status: (status || "PENDING") as any,
        observations: observations || null,
        visaCM: visaCM || null,
        visaEC: visaEC || null,
        updatedByUserId: userId,
      }).returning();
      return created;
    }
  }

  async getAttachmentsByAnswer(answerId: string): Promise<Attachment[]> {
    return db.select().from(attachments).where(and(eq(attachments.answerId, answerId), eq(attachments.deleted, false)));
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    const [created] = await db.insert(attachments).values(attachment).returning();
    return created;
  }

  async softDeleteAttachment(id: string): Promise<void> {
    await db.update(attachments).set({ deleted: true }).where(eq(attachments.id, id));
  }

  async getApprovalsByCycle(cycleId: string): Promise<Approval[]> {
    return db.select().from(approvals).where(eq(approvals.cycleId, cycleId));
  }

  async createApproval(approval: InsertApproval): Promise<Approval> {
    const [created] = await db.insert(approvals).values(approval).returning();
    return created;
  }

  async getLcbftRecord(exerciseId: string): Promise<LcbftRecord | undefined> {
    const [record] = await db.select().from(lcbftRecords).where(eq(lcbftRecords.exerciseId, exerciseId));
    return record;
  }

  async upsertLcbftRecord(exerciseId: string, data: Partial<InsertLcbftRecord>): Promise<LcbftRecord> {
    const existing = await this.getLcbftRecord(exerciseId);
    
    if (existing) {
      const [updated] = await db.update(lcbftRecords)
        .set(data)
        .where(eq(lcbftRecords.exerciseId, exerciseId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(lcbftRecords).values({
        exerciseId,
        ...data,
      } as InsertLcbftRecord).returning();
      return created;
    }
  }

  async validateLcbftRecord(exerciseId: string, userId: string): Promise<void> {
    await db.update(lcbftRecords)
      .set({ validatedByUserId: userId, validatedAt: new Date() })
      .where(eq(lcbftRecords.exerciseId, exerciseId));
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getDashboardStats() {
    const allClients = await db.select().from(clients);
    const allExercises = await db.select().from(exercises);
    
    const inReview = allExercises.filter(e => e.status === "IN_REVIEW").length;
    const locked = allExercises.filter(e => e.status === "LOCKED").length;
    
    const recentExercisesRaw = await db.select().from(exercises).orderBy(desc(exercises.createdAt)).limit(5);
    const recentExercises = await Promise.all(recentExercisesRaw.map(async (exercise) => {
      const [client] = await db.select().from(clients).where(eq(clients.id, exercise.clientId));
      const cycleList = await this.getCyclesByExercise(exercise.id);
      const totalQuestions = cycleList.reduce((acc, c) => acc + c.totalQuestions, 0);
      const answeredQuestions = cycleList.reduce((acc, c) => acc + c.answeredQuestions, 0);
      const progress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
      return { ...exercise, client, progress };
    }));
    
    return {
      totalClients: allClients.length,
      totalExercises: allExercises.length,
      inReview,
      locked,
      recentExercises,
    };
  }

  async seedDefaultData(): Promise<void> {
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) return;

    await db.insert(users).values([
      { username: "chef", password: "demo123", name: "Jean Dupont", email: "chef@cabinet.fr", role: "CHEF_MISSION" },
      { username: "expert", password: "demo123", name: "Marie Martin", email: "expert@cabinet.fr", role: "EXPERT_COMPTABLE" },
    ]);

    const [client1] = await db.insert(clients).values([
      { name: "Boulangerie du Coin", siret: "123 456 789 00012", address: "15 rue du Pain, 75001 Paris", notes: "Client fidèle depuis 2018" },
      { name: "Tech Solutions SAS", siret: "987 654 321 00034", address: "42 avenue des Startups, 69001 Lyon", notes: "PME innovante, secteur IT" },
      { name: "Restaurant Le Gourmet", siret: "456 789 123 00056", address: "8 place de la Mairie, 33000 Bordeaux", notes: "Activité saisonnière" },
    ]).returning();

    const [exercise1] = await db.insert(exercises).values({
      clientId: client1.id,
      year: 2025,
      status: "DRAFT",
    }).returning();

    const defaultCycles = [
      { name: "Cycle Trésorerie", order: 1 },
      { name: "Cycle Achats / Fournisseurs", order: 2 },
      { name: "Cycle Ventes / Clients", order: 3 },
      { name: "Cycle Stocks", order: 4 },
      { name: "Cycle Immobilisations", order: 5 },
      { name: "Cycle Social / Paie", order: 6 },
      { name: "Cycle Fiscal", order: 7 },
      { name: "Cycle Capitaux Propres", order: 8 },
    ];

    for (const cycleData of defaultCycles) {
      const [cycle] = await db.insert(cycles).values({
        exerciseId: exercise1.id,
        name: cycleData.name,
        order: cycleData.order,
      }).returning();

      const defaultQuestions = this.getDefaultQuestions(cycleData.name);
      for (let i = 0; i < defaultQuestions.length; i++) {
        await db.insert(questions).values({
          cycleId: cycle.id,
          label: defaultQuestions[i],
          order: i + 1,
          active: true,
        });
      }
    }
  }

  private getDefaultQuestions(cycleName: string): string[] {
    const questionsMap: Record<string, string[]> = {
      "Cycle Trésorerie": [
        "Les rapprochements bancaires sont-ils effectués mensuellement ?",
        "Les écarts de rapprochement sont-ils analysés et justifiés ?",
        "Les opérations de caisse sont-elles correctement enregistrées ?",
        "Les soldes bancaires sont-ils confirmés par les relevés ?",
      ],
      "Cycle Achats / Fournisseurs": [
        "Les factures fournisseurs sont-elles correctement enregistrées ?",
        "Le lettrage des comptes fournisseurs est-il à jour ?",
        "Les conditions de paiement sont-elles respectées ?",
        "Les avoirs fournisseurs sont-ils correctement comptabilisés ?",
      ],
      "Cycle Ventes / Clients": [
        "Les factures clients sont-elles correctement émises ?",
        "Le suivi des créances clients est-il effectué régulièrement ?",
        "Les provisions pour créances douteuses sont-elles justifiées ?",
        "Les conditions générales de vente sont-elles respectées ?",
      ],
      "Cycle Stocks": [
        "L'inventaire physique a-t-il été réalisé ?",
        "Les méthodes de valorisation sont-elles constantes ?",
        "Les stocks obsolètes sont-ils provisionnés ?",
        "Les mouvements de stocks sont-ils tracés ?",
      ],
      "Cycle Immobilisations": [
        "Le fichier des immobilisations est-il à jour ?",
        "Les amortissements sont-ils correctement calculés ?",
        "Les cessions d'immobilisations sont-elles correctement enregistrées ?",
        "Les dépréciations éventuelles sont-elles justifiées ?",
      ],
      "Cycle Social / Paie": [
        "Les bulletins de paie sont-ils conformes ?",
        "Les déclarations sociales sont-elles effectuées dans les délais ?",
        "Les provisions pour congés payés sont-elles correctes ?",
        "Les indemnités de fin de contrat sont-elles provisionnées ?",
      ],
      "Cycle Fiscal": [
        "Les déclarations de TVA sont-elles cohérentes ?",
        "L'impôt sur les sociétés est-il correctement provisionné ?",
        "Les crédits d'impôt sont-ils justifiés ?",
        "Les obligations déclaratives sont-elles respectées ?",
      ],
      "Cycle Capitaux Propres": [
        "Les mouvements de capitaux sont-ils documentés ?",
        "L'affectation du résultat est-elle conforme aux statuts ?",
        "Les réserves légales sont-elles correctement dotées ?",
        "Les comptes courants d'associés sont-ils conventionnés ?",
      ],
    };
    
    return questionsMap[cycleName] || [];
  }
}

export const storage = new DatabaseStorage();
