import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["CHEF_MISSION", "EXPERT_COMPTABLE"]);
export const exerciseStatusEnum = pgEnum("exercise_status", ["DRAFT", "IN_REVIEW", "LOCKED"]);
export const answerStatusEnum = pgEnum("answer_status", ["OK", "NON", "NA", "NEANT", "EN_COURS", "PENDING"]);
export const fileTypeEnum = pgEnum("file_type", ["PDF", "IMAGE", "EXCEL"]);
export const approvalLevelEnum = pgEnum("approval_level", ["CHEF_MISSION", "EXPERT_COMPTABLE"]);
export const vigilanceLevelEnum = pgEnum("vigilance_level", ["ALLEGEE", "NORMALE", "RENFORCEE"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRoleEnum("role").notNull().default("CHEF_MISSION"),
});

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  siret: text("siret"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const exercises = pgTable("exercises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  year: integer("year").notNull(),
  status: exerciseStatusEnum("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lockedAt: timestamp("locked_at"),
});

export const cycles = pgTable("cycles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exerciseId: varchar("exercise_id").notNull().references(() => exercises.id),
  name: text("name").notNull(),
  order: integer("order").notNull(),
});

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: varchar("cycle_id").notNull().references(() => cycles.id),
  label: text("label").notNull(),
  order: integer("order").notNull(),
  active: boolean("active").notNull().default(true),
  section: text("section"),
  appliesToIS: boolean("applies_to_is").notNull().default(true),
  appliesToBIC: boolean("applies_to_bic").notNull().default(true),
  appliesToBNC: boolean("applies_to_bnc").notNull().default(true),
});

export const answers = pgTable("answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questionId: varchar("question_id").notNull().references(() => questions.id),
  status: answerStatusEnum("status").notNull().default("PENDING"),
  comment: text("comment"),
  observations: text("observations"),
  visaCM: text("visa_cm"),
  visaEC: text("visa_ec"),
  updatedByUserId: varchar("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  answerId: varchar("answer_id").notNull().references(() => answers.id),
  fileType: fileTypeEnum("file_type").notNull(),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  deleted: boolean("deleted").notNull().default(false),
});

export const approvals = pgTable("approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: varchar("cycle_id").notNull().references(() => cycles.id),
  level: approvalLevelEnum("level").notNull(),
  approvedByUserId: varchar("approved_by_user_id").notNull().references(() => users.id),
  approvedAt: timestamp("approved_at").defaultNow().notNull(),
});

export const lcbftRecords = pgTable("lcbft_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exerciseId: varchar("exercise_id").notNull().references(() => exercises.id).unique(),
  vigilanceLevel: vigilanceLevelEnum("vigilance_level").notNull().default("NORMALE"),
  criteria: text("criteria").array(),
  justification: text("justification"),
  validatedByUserId: varchar("validated_by_user_id").references(() => users.id),
  validatedAt: timestamp("validated_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertExerciseSchema = createInsertSchema(exercises).omit({ id: true, createdAt: true, lockedAt: true });
export const insertCycleSchema = createInsertSchema(cycles).omit({ id: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertAnswerSchema = createInsertSchema(answers).omit({ id: true, updatedAt: true });
export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true, uploadedAt: true, deleted: true });
export const insertApprovalSchema = createInsertSchema(approvals).omit({ id: true, approvedAt: true });
export const insertLcbftRecordSchema = createInsertSchema(lcbftRecords).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercises.$inferSelect;
export type InsertCycle = z.infer<typeof insertCycleSchema>;
export type Cycle = typeof cycles.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;
export type Answer = typeof answers.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvals.$inferSelect;
export type InsertLcbftRecord = z.infer<typeof insertLcbftRecordSchema>;
export type LcbftRecord = typeof lcbftRecords.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export type UserRole = "CHEF_MISSION" | "EXPERT_COMPTABLE";
export type ExerciseStatus = "DRAFT" | "IN_REVIEW" | "LOCKED";
export type AnswerStatus = "OK" | "NON" | "NA" | "NEANT" | "EN_COURS" | "PENDING";
export type FileType = "PDF" | "IMAGE" | "EXCEL";
export type ApprovalLevel = "CHEF_MISSION" | "EXPERT_COMPTABLE";
export type VigilanceLevel = "ALLEGEE" | "NORMALE" | "RENFORCEE";

export type CycleWithProgress = Cycle & {
  totalQuestions: number;
  answeredQuestions: number;
  pendingIssues: number;
  chefMissionApproval?: Approval;
  expertComptableApproval?: Approval;
};

export type QuestionWithAnswer = Question & {
  answer?: Answer;
  attachments?: Attachment[];
};

export type ExerciseWithClient = Exercise & {
  client: Client;
  cycles?: CycleWithProgress[];
};
