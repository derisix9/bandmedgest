import {
  User,
  SchoolDatabase,
  Student,
  Teacher,
  ClassRoom,
  Subject,
  Course,
  AttendanceSheet,
  ExamPauta,
  TuitionInvoice,
  Notice,
  SchoolNotification,
  UserRole,
  LibraryBook,
  BookLoan,
  TimetableEntry,
  InstitutionSettings,
  SchoolServiceItem,
  SchoolAuditLog,
  SchoolCalendarEvent,
  StudentTrimesterRecord,
  InstitutionSummary,
  Funcionario,
  SchoolDepartment,
  DepartmentKind,
  Supplier,
  Matricula,
  MatriculaTipo,
  MatriculaEstado,
  MatriculaTipoAluno,
  GuardianStudentLink,
  GuardianRelation,
  GuardianUnlinkReason,
  Admission,
  AdmissionDocument,
  AdmissionStatus,
  AdmissionAssessmentType,
  PublicAdmissionRequest,
  PublicAdmissionStatus,
  PublicAdmissionConfig,
  AdmissionComplaint,
  ExamQuestion,
  ExamPaper,
  ExamPaperItem,
  ExamPaperType,
  QuestionStatus,
  CurriculumPlan,
  CurriculumUnit,
  SubjectClassAssignment,
  ExtracurricularActivity,
  ActivityScheduleSlot,
  ActivityEnrollment,
  ActivitySession,
  ActivityAttendanceEntry,
  ActivityStatus,
  PayrollRecord,
  LeaveRequest,
  TeacherEvaluation,
  TeacherEvaluationCriterionScore,
  CanteenMenu,
  CanteenSubscription,
  CanteenServiceRecord,
  CanteenServiceEntry,
  MealType,
  Asset,
  AssetCategory,
  AssetCondition,
  AssetStatus,
  StockItem,
  StockMovement,
  SchoolVehicle,
  TransportRoute,
  TransportRouteStop,
  TransportPersonKey,
  TransportPayment,
  StockMovementType,
  StudentMedicalRecord,
  BloodType,
  MedicalAllergy,
  MedicalCondition,
  MedicalMedication,
  MedicalEmergencyContact,
  MedicalOccurrence,
  VaccinationStatus,
  DisciplinaryIncident,
  IncidentParticipant,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  DisciplinaryMeasure,
  IncidentGuardianNotification,
  IncidentFollowUp,
  PickupAuthorization,
  PickupAuthorizationKind,
  PickupPersonRelation,
  PickupRecord,
  PickupReason,
  SmsWhatsappNotification,
  CommunicationChannel,
  NotificationAudienceType,
  NotificationRecipient,
  ParentTeacherMeeting,
  MeetingType,
  MeetingParticipant,
  MeetingParticipantStatus,
  InternalChatThread,
  InternalChatMessage,
  InternalChatParticipant,
  DataSubjectRequest,
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  DataProtectionPolicy,
  UserAccess
} from '../types';
import { isCashRegisterRequired } from '../utils/platformLock';
import * as cloud from './cloud';
import { isSignedIn } from './cloud';
import { signIn, signInWithTokenHash, sendPasswordReset, signOutUser as signOutSupabase } from './authSupabase';
import { setRemembered, touchActivity, clearActivity } from './sessionActivity';
import { supabase } from './supabase';
import { sbLoad, sbPush, sbListen, sbPage, type PageQuery } from './shardBackendSupabase';
import { findTuitionRowForGrade } from '../utils/educationSubsystems';
import {
  IMPORT_PHASE_SIZE, buildStatusRecord, lookupIdsOf, lookupIndexKey, newPublicRef, newStatusKey, statusSignature
} from '../utils/publicAdmission';
import {
  type LessonPlan, type LessonSummaryEntry, type TeachingMaterial,
  validateLessonPlan, planTransition, validateSummary, nextLessonNumber, validateMaterial,
  findSummariesForLesson, formatSummaryForAttendance
} from '../utils/teacherWork';
import { type Assignment, validateAssignment, submitWork, gradeSubmission } from '../utils/elearning';
import { type DescriptiveAssessment, defaultAreasForGrade, publishBlockers } from '../utils/earlyYears';
import {
  type LibraryPolicy, DEFAULT_LIBRARY_POLICY, addDaysISO, borrowBlockers, borrowerKeyOf,
  renewBlockers, renewLoan, returnLoan, markLost, payFine, waiveFine
} from '../utils/libraryLoans';
import { buildInstallmentPlan, buildLedger, computeSessionTotals, CASH_CLOSED_MESSAGE } from '../utils/financeExtras';
import type {
  AcademicDocument, ClassCouncilRecord, ClassCouncilStudentEntry, CouncilGradeChange, ExpenseRecord, CashSession,
  PaymentPlan, StoredDiscountRule, BankStatementLine, RecoveryRecord, StudentTransfer, SubjectEquivalence, StudentDependency,
  TransferInstitutionRef, TransferPackage, TransferredSubjectGrades, IncomingTransferRequest
} from '../types/processos';
import type { StudentMiniPautaItem } from '../types/pauta';
import {
  type CouncilContext, councilRegime, councilRowFor, diffGradeRows, editableFieldsOf, fieldLabel, fieldMax,
  recalcCouncilRow, sanitizeGradeInput
} from '../utils/councilGrades';
import { buildMiniPautaRows, studentExitKind, importedAveragesOf, rowHasOwnTrimesterGrades, findStudentSubjectRecord } from '../utils/pautaCalculations';
import {
  evaluateTransportPass, makeBoarding, makePayment, parsePersonKey, personKey, routeOccupancy, routeRiderKeys, shiftsClash
} from '../utils/transportPass';
import type { TripShift } from '../utils/transportPass';
import { isKeySubjectFor } from '../utils/keySubjects';
import {
  type AcademicDocType, DOC_LABEL, DOC_PREFIX, advanceRecovery, docVerificationCode, formatDocNumber,
  isEligibleForRecovery, nextDocSequence
} from '../utils/academicProcesses';
import {
  applyEquivalences, completedTrimesterGrades, dependencyLimitCheck, equivalenceToRecord, formatGuideNumber,
  nextGuideSeq, normSubject, outstandingInvoices, pendingDependencies, sumOutstanding, transferredGradesToRecords,
  validateTransferPackage
} from '../utils/transfers';
import { buildGatewayMessages, foldResultsByRecipient, isGatewayConfigured, sendViaGateway } from '../utils/notificationGateway';

import { calculateMT, calculateMFD, calculateCA, normalizeGradeRules } from '../utils/pautaCalculations';
import {
  generateStudentProcNumber,
  generateTeacherAgentNumber,
  generateFuncionarioNumber,
  generateSupplierCode,
  generateGuardianAutoEmail,
  generateStudentAutoEmail,
  generateTempPassword,
  generateMatriculaNumber,
  generateAssetCode,
  generateStockItemCode,
  generateVehicleCode,
  generateRouteCode,
  generateMedicalRecordCode,
  generateIncidentCode,
  generatePickupAuthorizationCode,
  generateNotificationCode,
  generateMeetingCode,
  generateDataSubjectRequestCode
} from '../utils/idGenerators';
import { buildAcademicYearList, getDefaultAngolaHolidays, getFallbackAcademicYear } from '../utils/academicYear';
import {
  SHARD_KEYS, applyUpdates, canReadCollection, chunkUpdates, deepEqual as shardDeepEqual, diffCollection,
  filterUpdatesForActor, fromRecordMap, isShardable, normalizeIds, stripUndefined as shardStripUndefined, toRecordMap,
  isYearScopedCollection, filterRecordsByAcademicYear
} from '../utils/shardSync';
import {
  UserProjectionData,
  buildAllUserProjections,
  buildProjectionForAluno,
  buildProjectionForEncarregado
} from '../utils/userProjections';
import {
  SAMPLE_SUPERIOR_UCS,
  SAMPLE_SUPERIOR_INSCRICOES,
  SAMPLE_MONOGRAFIAS_TCC,
  SAMPLE_ESTAGIOS,
  SAMPLE_BOLSAS,
  SAMPLE_DIPLOMAS
} from '../utils/superiorSeed';
import {
  UnidadeCurricular,
  InscricaoUC,
  MonografiaTCC,
  EstagioCurricular,
  BolsaEstudo,
  DiplomaSuperior
} from '../types/superior';
import { getLiveGradesYear, getStudentArchiveForYear } from '../utils/studentGrades';
import {
  defaultDataProtectionPolicy,
  validateDataSubjectRequest,
  DataSubjectRequestFieldsInput,
  REQUEST_TYPE_LABELS,
  REQUEST_STATUS_META
} from '../utils/dataProtection';
import {
  normalizeMedicalRecordFields,
  validateMedicalRecord,
  validateIncident,
  validateMeasure,
  validatePickupAuthorization,
  isPersonForbiddenForStudent,
  INCIDENT_CATEGORY_LABELS,
  MedicalRecordFieldsInput,
  IncidentFieldsInput,
  PickupAuthorizationFieldsInput
} from '../utils/healthSafety';
import {
  CHANNEL_LABELS,
  AUDIENCE_TYPE_LABELS,
  validateNotification,
  buildRecipientsForAudience,
  normalizeWhatsAppPhone,
  NotificationFieldsInput,
  MEETING_STATUS_META,
  validateMeeting,
  MeetingFieldsInput,
  buildMeetingParticipants
} from '../utils/comunicacao';
import { relationFromText, resolveGuardianChildren } from '../utils/guardianLinks';
import {
  DECISION_STATUSES,
  ADMISSION_STATUS_META,
  admissionToStudentPayload,
  canTransition,
  computeVacancies,
  emptyDocuments,
  ATTACHMENT_LIMITS,
  findDuplicateAdmission,
  findDuplicateStudent,
  generateAdmissionCode,
  validateAdmission
} from '../utils/admissions';
import {
  countQuestionUsage,
  generateExamPaperCode,
  generateQuestionCode,
  normalizeQuestionFields,
  paperTypeNeedsApproval,
  validatePaperForPublish,
  validateQuestion,
  sumPoints
} from '../utils/questionBank';
import { buildMulticaixaFields } from '../utils/multicaixa';
import {
  anyDateToIso,
  isoToDate,
  isoToPtDate,
  countSchoolWeeks,
  formatWeeksLabel,
  parseWeeksLabel,
  formatPeriodRange,
  parsePeriodRange,
  resolveActiveTrimester,
  nextAcademicYearLabel,
  defaultPeriodForAcademicYear,
  proposeTrimesterDates
} from '../utils/academicCalendar';
import {
  generatePlanCode,
  normalizePlanFields,
  normalizeUnit,
  validatePlan,
  validatePlanForApproval,
  findDuplicatePlan,
  clonePlanInput
} from '../utils/curriculum';
import {
  activeEnrollments,
  canTransitionActivity,
  checkEnrollment,
  findResourceConflicts,
  generateActivityCode,
  normalizeActivityFields,
  validateActivity,
  validateSessionDate,
  waitlist
} from '../utils/extracurriculars';
import {
  findMenu,
  findServiceRecord,
  generateSubscriptionCode,
  normalizeMenuFields,
  normalizeSubscriptionFields,
  validateMenu,
  validateServiceRecord,
  validateSubscription
} from '../utils/canteen';
import { computePayroll, getEffectivePayrollTaxSettings, listEligiblePeople } from '../utils/payroll';
import { countWorkingDays, hasOverlappingLeave, listLeaveEligiblePeople } from '../utils/leaveManagement';
import { buildDefaultCriteria, classifyScore, computeFinalScore } from '../utils/teacherEvaluation';

const STORAGE_KEY = 'bandmed_escola_db_v1';

// Initial Demo Seed Data
const defaultUsers: User[] = [];

const defaultStudents: Student[] = [];

const defaultTeachers: Teacher[] = [];

const defaultClasses: ClassRoom[] = [];

const defaultSubjects: Subject[] = [];

const defaultCourses: Course[] = [];

const defaultAttendance: AttendanceSheet = {
  id: '', date: '', formattedDate: '', classId: '', className: '',
  subjectId: '', subjectName: '', teacherId: '', teacherName: '',
  timeSlot: '', room: '', status: 'aberto', lessonSummary: '',
  isDigitallySigned: false, students: []
};

const defaultAttendanceSheets: AttendanceSheet[] = [];

const defaultPauta: ExamPauta = {
  id: '', referenceCode: '', academicYear: '', trimester: '1',
  classId: '', className: '', subjectId: '', subjectName: '',
  evaluationTitle: '', teacherName: '', teacherAgentNumber: '',
  status: 'em_lancamento', classAverage: 0, highestGrade: 0, lowestGrade: 0,
  approvalRatePercent: 0, approvedCount: 0, failedCount: 0, lastUpdated: '',
  grades: []
};

const defaultInvoices: TuitionInvoice[] = [];

const defaultNotices: Notice[] = [];

export const defaultNotifications: SchoolNotification[] = [];

const defaultBooks: LibraryBook[] = [];

const defaultLoans: BookLoan[] = [];

const defaultTimetable: TimetableEntry[] = [];

// Structural/functional defaults only — NO institution identity is hardcoded here.
// A brand-new installation must have its real name, NIF, address, logo, etc. filled in
// by the admin under Configurações > Dados da Instituição, and persisted to o Realtime Database.
function computeDefaultAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  // School year in Angola runs roughly Sep–Jul, so before September we're still in "y-1/y"
  const startYear = now.getMonth() >= 8 ? y : y - 1;
  return `${startYear}/${startYear + 1}`;
}

const defaultSettings: InstitutionSettings = {
  schoolName: '',
  subTitle: '',
  nif: '',
  decreeAuthorization: '',
  province: '',
  municipality: '',
  address: '',
  email: '',
  phone: '',
  logoUrl: '',
  currentAcademicYear: computeDefaultAcademicYear(),
  availableAcademicYears: [computeDefaultAcademicYear()],
  currencyCode: 'Kz',
  currentTrimester: '1',
  selectedSubsystems: [],
  directorGeral: '',
  directorPedagogico: '',
  chefeSecretaria: '',
  website: '',
  bairro: '',
  academicPeriod: '',
  academicWeeks: '',
  trimesterSchedules: {
    t1: { startDate: '', endDate: '', examPeriod: '', gradesCouncilDate: '', weeksCount: '' },
    t2: { startDate: '', endDate: '', examPeriod: '', gradesCouncilDate: '', weeksCount: '' },
    t3: { startDate: '', endDate: '', examPeriod: '', gradesCouncilDate: '', weeksCount: '' }
  }
};

export const defaultServices: SchoolServiceItem[] = [];

export const defaultAuditLogs: SchoolAuditLog[] = [];
export const defaultMatriculas: Matricula[] = [];

export const defaultEvents: SchoolCalendarEvent[] = [];

// SchoolDatabase agora é importado de '../types' (fonte única) — esta interface local
// estava desatualizada (sem subjectAssignments, guardianChatThreads, tuitionInvoices, etc.),
// o que causava erros de tipo silenciosos entre db.ts e o resto da aplicação.

/** Ato de homologação de uma pauta: quem assinou, quando, e o que foi assinado. */
export interface PautaHomologation {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  trimester: 1 | 2 | 3 | 'final';
  academicYear: string;
  signedByUserId: string;
  signedByName: string;
  signedByRole: string;
  signedAt: string;
  studentCount: number;
  approvedCount: number;
  failedCount: number;
  /** Impressão digital das notas assinadas, para detetar alterações posteriores. */
  gradesFingerprint: string;
  notes?: string;
}

export function createCleanInstitutionDb(
  institutionId: string,
  adminUser: User,
  settingsData?: Partial<InstitutionSettings>
): SchoolDatabase {
  return {
    users: [adminUser],
    currentUser: adminUser,
    students: [],
    matriculas: [],
    teachers: [],
    funcionarios: [],
    departments: [],
    suppliers: [],
    guardianLinks: [],
    admissions: [],
    questions: [],
    examPapers: [],
    curriculumPlans: [],
    subjectAssignments: [],
    extracurricularActivities: [],
    canteenMenus: [],
    canteenSubscriptions: [],
    canteenServices: [],
    payrollRecords: [],
    leaveRequests: [],
    teacherEvaluations: [],
    assets: [],
    stockItems: [],
    stockMovements: [],
    vehicles: [],
    transportRoutes: [],
    medicalRecords: [],
    disciplinaryIncidents: [],
    pickupAuthorizations: [],
    pickupRecords: [],
    smsWhatsappNotifications: [],
    parentTeacherMeetings: [],
    internalChatThreads: [],
    dataSubjectRequests: [],
    classes: [],
    subjects: [],
    courses: [],
    unidadesCurriculares: [],
    inscricoesUC: [],
    monografiasTCC: [],
    estagiosCurriculares: [],
    bolsasEstudo: [],
    diplomasSuperior: [],
    attendance: {
      id: `att-init-${institutionId}`,
      date: new Date().toISOString().split('T')[0],
      formattedDate: new Date().toLocaleDateString('pt-PT'),
      classId: '',
      className: '',
      subjectId: '',
      subjectName: '',
      teacherId: adminUser.id,
      teacherName: adminUser.name,
      timeSlot: '08:00 - 09:30',
      room: '',
      status: 'aberto',
      lessonSummary: '',
      isDigitallySigned: false,
      students: []
    },
    attendanceSheets: [],
    pauta: {
      id: `pauta-init-${institutionId}`,
      referenceCode: `PAUTA-${Date.now().toString().slice(-4)}`,
      academicYear: settingsData?.currentAcademicYear || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      trimester: '1',
      classId: '',
      className: '',
      subjectId: '',
      subjectName: '',
      evaluationTitle: '1.ª Avaliação Trimestral',
      teacherName: adminUser.name,
      teacherAgentNumber: '',
      status: 'em_lancamento',
      classAverage: 0,
      highestGrade: 0,
      lowestGrade: 0,
      approvalRatePercent: 0,
      approvedCount: 0,
      failedCount: 0,
      lastUpdated: new Date().toLocaleDateString('pt-PT'),
      grades: []
    },
    invoices: [],
    tuitionFees: [],
    services: [],
    notices: [],
    notifications: [],
    books: [],
    loans: [],
    timetable: [],
    miniPautasStore: {},
    homologations: [],
    events: [],
    auditLogs: [
      {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toLocaleDateString('pt-PT') + ' ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        userName: adminUser.name,
        userRole: 'Administrador Geral',
        action: 'Criação da Instituição',
        details: 'Instituição registada e base de dados isolada inicializada com sucesso.',
        module: 'sistema',
        createdAt: Date.now(),
        badgeColor: '#0b1f3a'
      }
    ],
    settings: {
      institutionId,
      schoolName: settingsData?.schoolName || '',
      subTitle: settingsData?.subTitle || '',
      nif: settingsData?.nif || '',
      decreeAuthorization: settingsData?.decreeAuthorization || '',
      province: settingsData?.province || '',
      municipality: settingsData?.municipality || '',
      address: settingsData?.address || '',
      email: settingsData?.email || '',
      phone: settingsData?.phone || '',
      logoUrl: settingsData?.logoUrl || '',
      currentAcademicYear: settingsData?.currentAcademicYear || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      availableAcademicYears: settingsData?.availableAcademicYears && settingsData.availableAcademicYears.length > 0
        ? settingsData.availableAcademicYears
        : [settingsData?.currentAcademicYear || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`],
      currencyCode: 'Kz',
      currentTrimester: '1',
      directorGeral: settingsData?.directorGeral || '',
      directorPedagogico: settingsData?.directorPedagogico || '',
      chefeSecretaria: settingsData?.chefeSecretaria || '',
      website: settingsData?.website || '',
      bairro: settingsData?.bairro || '',
      academicPeriod: settingsData?.academicPeriod || '',
      academicWeeks: settingsData?.academicWeeks || '',
      trimesterSchedules: settingsData?.trimesterSchedules || {
        t1: { startDate: '', endDate: '', examPeriod: '', gradesCouncilDate: '', weeksCount: '' },
        t2: { startDate: '', endDate: '', examPeriod: '', gradesCouncilDate: '', weeksCount: '' },
        t3: { startDate: '', endDate: '', examPeriod: '', gradesCouncilDate: '', weeksCount: '' }
      },
      academicPauses: [],
      tuitionRows: [],
      emolumentos: [],
      financialRules: {
        paymentDueDay: 10,
        lateFeePercent: 10.0,
        discountPercent: 8.0,
        siblingDiscountPercent: 10.0
      },
      gradeRules: {
        macWeight: 0.3,
        ppWeight: 0.3,
        ptWeight: 0.4,
        minPassingGrade: 10,
        passingGrade: 10,
        recursoMinGrade: 7,
        examWaiverGrade: 14,
        strictDecimals: false,
        roundRuleHalfUp: true
      },
      securityPolicies: {
        twoFactorActive: false,
        sessionTimeout: '60',
        maxFailedAttempts: '5',
        passwordExpirationDays: '90'
      }
    }
  };
}

function getInitialDb(): SchoolDatabase {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    let activeInstId = localStorage.getItem('escola_active_institution_id');
    if (!activeInstId) {
      try {
        const sessionUserRaw = localStorage.getItem('bandmed_session_user');
        if (sessionUserRaw) {
          const sessionUser = JSON.parse(sessionUserRaw);
          if (sessionUser && sessionUser.institutionId) {
            activeInstId = sessionUser.institutionId;
          }
        }
      } catch {
        // ignore
      }
    }

    if (activeInstId && activeInstId !== 'inst_bandmed') {
      const savedInst = localStorage.getItem('escola_inst_' + activeInstId);
      if (savedInst) {
        try {
          const parsed = JSON.parse(savedInst);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.users)) {
            return parsed;
          }
        } catch {
          // ignore and fallback
        }
      }
    }
  }

  // Clean, empty database. Nothing here is seeded/fake — every collection starts
  // empty and is populated exclusively through real writes to Realtime Database.
  let base: any = {
    users: [] as User[],
    currentUser: null,
    students: defaultStudents,
    matriculas: defaultMatriculas,
    teachers: defaultTeachers,
    departments: [],
    suppliers: [],
    guardianLinks: [],
    admissions: [],
    questions: [],
    examPapers: [],
    curriculumPlans: [],
    subjectAssignments: [],
    extracurricularActivities: [],
    canteenMenus: [],
    canteenSubscriptions: [],
    canteenServices: [],
    payrollRecords: [],
    leaveRequests: [],
    teacherEvaluations: [],
    assets: [],
    stockItems: [],
    stockMovements: [],
    vehicles: [],
    transportRoutes: [],
    medicalRecords: [],
    disciplinaryIncidents: [],
    pickupAuthorizations: [],
    pickupRecords: [],
    smsWhatsappNotifications: [],
    parentTeacherMeetings: [],
    internalChatThreads: [],
    dataSubjectRequests: [],
    classes: defaultClasses,
    subjects: defaultSubjects,
    courses: defaultCourses,
    unidadesCurriculares: SAMPLE_SUPERIOR_UCS,
    inscricoesUC: SAMPLE_SUPERIOR_INSCRICOES,
    monografiasTCC: SAMPLE_MONOGRAFIAS_TCC,
    estagiosCurriculares: SAMPLE_ESTAGIOS,
    bolsasEstudo: SAMPLE_BOLSAS,
    diplomasSuperior: SAMPLE_DIPLOMAS,
    attendance: defaultAttendance,
    attendanceSheets: defaultAttendanceSheets,
    pauta: defaultPauta,
    invoices: defaultInvoices,
    services: defaultServices,
    notices: defaultNotices,
    notifications: defaultNotifications,
    books: defaultBooks,
    loans: defaultLoans,
    timetable: defaultTimetable,
    settings: defaultSettings,
    auditLogs: defaultAuditLogs,
    events: defaultEvents,
    miniPautasStore: {}
  };

  // Rehydrate ONLY what this browser genuinely persisted from a real session
  // (this cache is a local mirror of Realtime Database, never a source of seed data).
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        base = {
          ...base,
          ...parsed,
          users: Array.isArray(parsed.users) ? parsed.users : base.users,
          students: Array.isArray(parsed.students) ? parsed.students : base.students,
          matriculas: Array.isArray(parsed.matriculas) ? parsed.matriculas : base.matriculas,
          teachers: Array.isArray(parsed.teachers) ? parsed.teachers : base.teachers,
          departments: Array.isArray(parsed.departments) ? parsed.departments : base.departments,
          suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : base.suppliers,
          guardianLinks: Array.isArray(parsed.guardianLinks) ? parsed.guardianLinks : base.guardianLinks,
          admissions: Array.isArray(parsed.admissions) ? parsed.admissions : base.admissions,
          questions: Array.isArray(parsed.questions) ? parsed.questions : base.questions,
          examPapers: Array.isArray(parsed.examPapers) ? parsed.examPapers : base.examPapers,
          curriculumPlans: Array.isArray(parsed.curriculumPlans) ? parsed.curriculumPlans : base.curriculumPlans,
          subjectAssignments: Array.isArray(parsed.subjectAssignments) ? parsed.subjectAssignments : base.subjectAssignments,
          extracurricularActivities: Array.isArray(parsed.extracurricularActivities)
            ? parsed.extracurricularActivities
            : base.extracurricularActivities,
          canteenMenus: Array.isArray(parsed.canteenMenus) ? parsed.canteenMenus : base.canteenMenus,
          canteenSubscriptions: Array.isArray(parsed.canteenSubscriptions) ? parsed.canteenSubscriptions : base.canteenSubscriptions,
          canteenServices: Array.isArray(parsed.canteenServices) ? parsed.canteenServices : base.canteenServices,
          payrollRecords: Array.isArray(parsed.payrollRecords) ? parsed.payrollRecords : base.payrollRecords,
          leaveRequests: Array.isArray(parsed.leaveRequests) ? parsed.leaveRequests : base.leaveRequests,
          teacherEvaluations: Array.isArray(parsed.teacherEvaluations) ? parsed.teacherEvaluations : base.teacherEvaluations,
          assets: Array.isArray(parsed.assets) ? parsed.assets : base.assets,
          stockItems: Array.isArray(parsed.stockItems) ? parsed.stockItems : base.stockItems,
          stockMovements: Array.isArray(parsed.stockMovements) ? parsed.stockMovements : base.stockMovements,
          vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : base.vehicles,
          transportRoutes: Array.isArray(parsed.transportRoutes) ? parsed.transportRoutes : base.transportRoutes,
          medicalRecords: Array.isArray(parsed.medicalRecords) ? parsed.medicalRecords : base.medicalRecords,
          disciplinaryIncidents: Array.isArray(parsed.disciplinaryIncidents) ? parsed.disciplinaryIncidents : base.disciplinaryIncidents,
          pickupAuthorizations: Array.isArray(parsed.pickupAuthorizations) ? parsed.pickupAuthorizations : base.pickupAuthorizations,
          pickupRecords: Array.isArray(parsed.pickupRecords) ? parsed.pickupRecords : base.pickupRecords,
          smsWhatsappNotifications: Array.isArray(parsed.smsWhatsappNotifications) ? parsed.smsWhatsappNotifications : base.smsWhatsappNotifications,
          parentTeacherMeetings: Array.isArray(parsed.parentTeacherMeetings) ? parsed.parentTeacherMeetings : base.parentTeacherMeetings,
          internalChatThreads: Array.isArray(parsed.internalChatThreads) ? parsed.internalChatThreads : base.internalChatThreads,
          dataSubjectRequests: Array.isArray(parsed.dataSubjectRequests) ? parsed.dataSubjectRequests : base.dataSubjectRequests,
          classes: Array.isArray(parsed.classes) ? parsed.classes : base.classes,
          subjects: Array.isArray(parsed.subjects) ? parsed.subjects : base.subjects,
          courses: Array.isArray(parsed.courses) ? parsed.courses : base.courses,
          invoices: Array.isArray(parsed.invoices) ? parsed.invoices : base.invoices,
          attendance: parsed.attendance || base.attendance,
          attendanceSheets: Array.isArray(parsed.attendanceSheets) ? parsed.attendanceSheets : base.attendanceSheets,
          books: Array.isArray(parsed.books) ? parsed.books : base.books,
          services: Array.isArray(parsed.services) ? parsed.services : base.services,
          notices: Array.isArray(parsed.notices) ? parsed.notices : base.notices,
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : base.notifications,
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : base.auditLogs,
          events: Array.isArray(parsed.events) ? parsed.events : base.events,
          miniPautasStore: parsed.miniPautasStore || {},
          settings: { ...defaultSettings, ...(parsed.settings || {}) }
        };
      }
    }
  } catch (e) {
    console.error('Error loading db from localStorage', e);
  }

  base.tuitionFees = base.invoices;
  return base as SchoolDatabase;
}

const IDB_NAME = 'bandmed_school_db';
const IDB_STORE = 'school_database';
const IDB_VERSION = 1;

class SchoolIndexedDB {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private getDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.resolve(null);
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
              db.createObjectStore(IDB_STORE);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => {
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  public async save(data: SchoolDatabase, instId?: string): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;
    const storeKey = instId ? `inst_${instId}` : (data.settings?.institutionId ? `inst_${data.settings.institutionId}` : 'current_db');
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(data, storeKey);
        store.put(data, 'current_db');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async load(instId?: string): Promise<SchoolDatabase | null> {
    const db = await this.getDB();
    if (!db) return null;
    const storeKey = instId ? (instId.startsWith('inst_') ? instId : `inst_${instId}`) : 'current_db';
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(storeKey);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result);
          } else if (storeKey !== 'current_db') {
            const fallbackReq = store.get('current_db');
            fallbackReq.onsuccess = () => resolve(fallbackReq.result || null);
            fallbackReq.onerror = () => resolve(null);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async clear(): Promise<void> {
    const db = await this.getDB();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
    } catch (e) {
      console.warn(e);
    }
  }
}

export const idbService = new SchoolIndexedDB();

/**
 * Remove recursivamente todas as propriedades com valor `undefined` de um payload antes
 * de o escrever na nuvem, que rejeita a operação completa (lançando
 * "contains undefined in property...") se encontrar uma única. Arrays são preservados;
 * elementos `undefined` dentro de arrays são convertidos em `null` para não alterar índices.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : stripUndefinedDeep(item))) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      if (val === undefined) return;
      out[key] = stripUndefinedDeep(val);
    });
    return out as unknown as T;
  }
  return value;
}

/**
 * Strips heavy dataUrls from attachments for localStorage to guarantee never exceeding browser 5MB quota.
 * Full dataUrls remain safely preserved in IndexedDB and in-memory application state.
 */
function prepareSafeLocalStorageSnapshot(db: SchoolDatabase): string {
  const sanitizeStudent = (st: Student): Student => ({
    ...st,
    docPassPhoto: (st.docPassPhoto && st.docPassPhoto.length > 20000) ? '' : st.docPassPhoto,
    docBiFile: st.docBiFile
      ? { ...st.docBiFile, dataUrl: (st.docBiFile.dataUrl && st.docBiFile.dataUrl.length > 20000) ? '' : st.docBiFile.dataUrl }
      : null,
    docCertificateFile: st.docCertificateFile
      ? { ...st.docCertificateFile, dataUrl: (st.docCertificateFile.dataUrl && st.docCertificateFile.dataUrl.length > 20000) ? '' : st.docCertificateFile.dataUrl }
      : null,
    additionalDocs: (st.additionalDocs || []).map((doc) => ({
      ...doc,
      dataUrl: (doc.dataUrl && doc.dataUrl.length > 20000) ? '' : doc.dataUrl
    }))
  });

  const sanitizeTeacher = (t: Teacher): Teacher => ({
    ...t,
    avatar: (t.avatar && t.avatar.length > 20000) ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150' : t.avatar
  });

  const safeDb: SchoolDatabase = {
    ...db,
    students: (db.students || []).map(sanitizeStudent),
    teachers: (db.teachers || []).map(sanitizeTeacher),
    funcionarios: db.funcionarios || [],
    departments: db.departments || [],
    suppliers: db.suppliers || [],
    guardianLinks: db.guardianLinks || [],
    admissions: (db.admissions || []).map((a) => ({
      ...a,
      documents: (a.documents || []).map((d) =>
        d.attachment && d.attachment.dataUrl && d.attachment.dataUrl.length > 20000
          ? { ...d, attachment: { ...d.attachment, dataUrl: '' } }
          : d
      )
    })),
    questions: db.questions || [],
    examPapers: db.examPapers || [],
    curriculumPlans: db.curriculumPlans || [],
    subjectAssignments: db.subjectAssignments || [],
    extracurricularActivities: db.extracurricularActivities || [],
    canteenMenus: (db.canteenMenus || []).map((m) => ({ ...m, allergens: m.allergens || [] })),
    canteenSubscriptions: (db.canteenSubscriptions || []).map((s) => ({ ...s, allergies: s.allergies || [] })),
    canteenServices: db.canteenServices || [],
    payrollRecords: db.payrollRecords || [],
    leaveRequests: db.leaveRequests || [],
    teacherEvaluations: db.teacherEvaluations || [],
    assets: db.assets || [],
    stockItems: db.stockItems || [],
    stockMovements: db.stockMovements || [],
    vehicles: db.vehicles || [],
    transportRoutes: db.transportRoutes || [],
    medicalRecords: (db.medicalRecords || []).map((r) => ({
      ...r,
      allergies: r.allergies || [],
      conditions: r.conditions || [],
      medications: r.medications || [],
      emergencyContacts: r.emergencyContacts || [],
      occurrences: r.occurrences || []
    })),
    disciplinaryIncidents: (db.disciplinaryIncidents || []).map((i) => ({
      ...i,
      participants: i.participants || [],
      followUps: i.followUps || []
    })),
    pickupAuthorizations: db.pickupAuthorizations || [],
    pickupRecords: db.pickupRecords || [],
    smsWhatsappNotifications: db.smsWhatsappNotifications || [],
    parentTeacherMeetings: db.parentTeacherMeetings || [],
    internalChatThreads: db.internalChatThreads || [],
    dataSubjectRequests: db.dataSubjectRequests || [],
  };

  return JSON.stringify(safeDb);
}

export class SchoolDatabaseService {
  private db: SchoolDatabase;
  private listeners: Set<(db: SchoolDatabase) => void> = new Set();
  private syncStatusListeners: Set<(status: 'synced' | 'syncing' | 'offline' | 'error') => void> = new Set();
  private syncStatus: 'synced' | 'syncing' | 'offline' | 'error' = 'synced';
  private syncTimer: any = null;
  private lastSyncedTimestamp: string = '';
  public activeInstitutionId: string = 'inst_bandmed';
  private unsubscribeRealtime: (() => void) | null = null;
  // Acesso por utilizador: vive em `access_control/{instituição}/{uid}` (só o admin escreve).
  // Nunca vai em `users/*` nem no documento da instituição, que qualquer membro pode escrever.
  private accessMap: Record<string, UserAccess | null> = {};
  private accessLoaded = false;
  private unsubscribeAccess: (() => void) | null = null;
  // Retry bookkeeping: a `pushToCloudStorage()` can fail silently (network blip,
  // tab closed mid-write, Realtime Database momentarily unreachable). Without an
  // automatic retry, that specific change stays saved only in IndexedDB/localStorage
  // on the device that made it and never reaches other devices/logins. These fields
  // drive a backoff retry loop plus an immediate retry as soon as the browser is
  // back online, so a failed sync is not silently lost.
  private retryTimer: any = null;
  private retryAttempts: number = 0;
  private hasPendingLocalChanges: boolean = false;
  private remoteSyncRetryTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const active = localStorage.getItem('escola_active_institution_id');
      if (active) {
        this.activeInstitutionId = active;
      } else {
        try {
          const sessionUserRaw = localStorage.getItem('bandmed_session_user');
          if (sessionUserRaw) {
            const sessionUser = JSON.parse(sessionUserRaw);
            if (sessionUser && sessionUser.institutionId) {
              this.activeInstitutionId = sessionUser.institutionId;
            }
          }
        } catch {
          // ignore
        }
      }
    }
    this.db = getInitialDb();
    // Hydrate any rich offline data from IndexedDB
    this.initFromIndexedDb();
    // Automatically initialize institutional cloud synchronization
    this.initRemoteSync();

    if (typeof window !== 'undefined') {
      // Regained connectivity: retry immediately instead of waiting for the
      // next mutation or the next full page load.
      window.addEventListener('online', () => {
        if (this.hasPendingLocalChanges || this.syncStatus !== 'synced') {
          this.retryAttempts = 0;
          this.pushToCloudStorage();
        }
      });
      // A tab can be closed well within the 600ms debounce window after the
      // last change (e.g. right after submitting a form). Flush any pending
      // write immediately when the tab is hidden/closed so it isn't lost.
      const flushPending = () => {
        if (this.syncTimer) {
          clearTimeout(this.syncTimer);
          this.syncTimer = null;
          this.pushToCloudStorage();
        }
      };
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPending();
      });
      window.addEventListener('pagehide', flushPending);
    }
  }

  private async initFromIndexedDb(): Promise<void> {
    try {
      const stored = await idbService.load(this.activeInstitutionId);
      if (stored) {
        const storedInstId = stored.settings?.institutionId || 'inst_bandmed';
        // Only hydrate if the stored database matches the currently active institution
        if (storedInstId === this.activeInstitutionId) {
          this.db = {
            ...this.db,
            ...stored,
            // Guard: never wipe out new admin users or created accounts with stale IndexedDB users
            users: (this.db.users && this.db.users.length > 0) ? this.db.users : (stored.users || this.db.users),
            students: (stored.students && stored.students.length > 0) ? stored.students : this.db.students,
            matriculas: (stored.matriculas && stored.matriculas.length > 0) ? stored.matriculas : this.db.matriculas,
            teachers: (stored.teachers && stored.teachers.length > 0) ? stored.teachers : this.db.teachers,
            funcionarios: (stored.funcionarios && stored.funcionarios.length > 0) ? stored.funcionarios : this.db.funcionarios,
            departments: (stored.departments && stored.departments.length > 0) ? stored.departments : this.db.departments,
            suppliers: (stored.suppliers && stored.suppliers.length > 0) ? stored.suppliers : this.db.suppliers,
            guardianLinks: (stored.guardianLinks && stored.guardianLinks.length > 0) ? stored.guardianLinks : this.db.guardianLinks,
            admissions: (stored.admissions && stored.admissions.length > 0) ? stored.admissions : this.db.admissions,
            questions: (stored.questions && stored.questions.length > 0) ? stored.questions : this.db.questions,
            examPapers: (stored.examPapers && stored.examPapers.length > 0) ? stored.examPapers : this.db.examPapers,
            curriculumPlans: (stored.curriculumPlans && stored.curriculumPlans.length > 0) ? stored.curriculumPlans : this.db.curriculumPlans,
            subjectAssignments: (stored.subjectAssignments && stored.subjectAssignments.length > 0) ? stored.subjectAssignments : this.db.subjectAssignments,
            extracurricularActivities:
              (stored.extracurricularActivities && stored.extracurricularActivities.length > 0)
                ? stored.extracurricularActivities
                : this.db.extracurricularActivities,
            canteenMenus: (stored.canteenMenus && stored.canteenMenus.length > 0) ? stored.canteenMenus : this.db.canteenMenus,
            canteenSubscriptions:
              (stored.canteenSubscriptions && stored.canteenSubscriptions.length > 0) ? stored.canteenSubscriptions : this.db.canteenSubscriptions,
            canteenServices: (stored.canteenServices && stored.canteenServices.length > 0) ? stored.canteenServices : this.db.canteenServices,
            payrollRecords: (stored.payrollRecords && stored.payrollRecords.length > 0) ? stored.payrollRecords : this.db.payrollRecords,
            leaveRequests: (stored.leaveRequests && stored.leaveRequests.length > 0) ? stored.leaveRequests : this.db.leaveRequests,
            teacherEvaluations: (stored.teacherEvaluations && stored.teacherEvaluations.length > 0) ? stored.teacherEvaluations : this.db.teacherEvaluations,
            assets: (stored.assets && stored.assets.length > 0) ? stored.assets : this.db.assets,
            stockItems: (stored.stockItems && stored.stockItems.length > 0) ? stored.stockItems : this.db.stockItems,
            stockMovements: (stored.stockMovements && stored.stockMovements.length > 0) ? stored.stockMovements : this.db.stockMovements,
            vehicles: (stored.vehicles && stored.vehicles.length > 0) ? stored.vehicles : this.db.vehicles,
            transportRoutes: (stored.transportRoutes && stored.transportRoutes.length > 0) ? stored.transportRoutes : this.db.transportRoutes,
            medicalRecords: (stored.medicalRecords && stored.medicalRecords.length > 0) ? stored.medicalRecords : this.db.medicalRecords,
            disciplinaryIncidents: (stored.disciplinaryIncidents && stored.disciplinaryIncidents.length > 0) ? stored.disciplinaryIncidents : this.db.disciplinaryIncidents,
            pickupAuthorizations: (stored.pickupAuthorizations && stored.pickupAuthorizations.length > 0) ? stored.pickupAuthorizations : this.db.pickupAuthorizations,
            pickupRecords: (stored.pickupRecords && stored.pickupRecords.length > 0) ? stored.pickupRecords : this.db.pickupRecords,
            smsWhatsappNotifications: (stored.smsWhatsappNotifications && stored.smsWhatsappNotifications.length > 0) ? stored.smsWhatsappNotifications : this.db.smsWhatsappNotifications,
            parentTeacherMeetings: (stored.parentTeacherMeetings && stored.parentTeacherMeetings.length > 0) ? stored.parentTeacherMeetings : this.db.parentTeacherMeetings,
            internalChatThreads: (stored.internalChatThreads && stored.internalChatThreads.length > 0) ? stored.internalChatThreads : this.db.internalChatThreads,
            dataSubjectRequests: (stored.dataSubjectRequests && stored.dataSubjectRequests.length > 0) ? stored.dataSubjectRequests : this.db.dataSubjectRequests,
            attendanceSheets: stored.attendanceSheets || this.db.attendanceSheets,
            invoices: stored.invoices || this.db.invoices
          };
          const currentData = this.getDatabase();
          this.listeners.forEach((listener) => listener(currentData));
        }
      }
    } catch (e) {
      console.warn('Could not hydrate from IndexedDB:', e);
    }
  }

  public getSnapshot(): SchoolDatabase {
    return {
      ...this.db,
      attendance: this.db.attendance,
      attendanceSheets: this.db.attendanceSheets || [],
      invoices: this.db.invoices || [],
      tuitionFees: this.db.invoices || [],
      books: this.db.books || [],
      students: this.db.students || [],
      matriculas: this.db.matriculas || [],
      teachers: this.db.teachers || [],
      funcionarios: this.db.funcionarios || [],
      departments: this.db.departments || [],
      suppliers: this.db.suppliers || [],
      guardianLinks: this.db.guardianLinks || [],
      admissions: this.db.admissions || [],
      questions: this.db.questions || [],
      examPapers: this.db.examPapers || [],
      curriculumPlans: this.db.curriculumPlans || [],
      subjectAssignments: this.db.subjectAssignments || [],
      extracurricularActivities: this.db.extracurricularActivities || [],
      canteenMenus: (this.db.canteenMenus || []).map((m) => ({ ...m, allergens: m.allergens || [] })),
      // uma inscrição sem alergias/refeições/dias perderia esses campos ao voltar da nuvem.
      canteenSubscriptions: (this.db.canteenSubscriptions || []).map((s) => ({
        ...s,
        meals: s.meals || [],
        weekdays: s.weekdays || [],
        allergies: s.allergies || []
      })),
      canteenServices: this.db.canteenServices || [],
      payrollRecords: this.db.payrollRecords || [],
      leaveRequests: this.db.leaveRequests || [],
      teacherEvaluations: this.db.teacherEvaluations || [],
      assets: this.db.assets || [],
      stockItems: this.db.stockItems || [],
      stockMovements: this.db.stockMovements || [],
      vehicles: this.db.vehicles || [],
      transportRoutes: this.db.transportRoutes || [],
      // uma ficha médica sem alergias/condições/medicação/contactos/ocorrências perderia esses
      // campos ao voltar da nuvem (o Realtime Database não guarda arrays vazios), o que fazia
      // o modal "Ver Ficha" rebentar com "Cannot read properties of undefined (reading 'length')".
      medicalRecords: (this.db.medicalRecords || []).map((r) => ({
        ...r,
        allergies: r.allergies || [],
        conditions: r.conditions || [],
        medications: r.medications || [],
        emergencyContacts: r.emergencyContacts || [],
        occurrences: r.occurrences || []
      })),
      // o mesmo problema acontecia com um incidente sem participantes/seguimento registados.
      disciplinaryIncidents: (this.db.disciplinaryIncidents || []).map((i) => ({
        ...i,
        participants: i.participants || [],
        followUps: i.followUps || []
      })),
      pickupAuthorizations: this.db.pickupAuthorizations || [],
      pickupRecords: this.db.pickupRecords || [],
      smsWhatsappNotifications: this.db.smsWhatsappNotifications || [],
      parentTeacherMeetings: this.db.parentTeacherMeetings || [],
      internalChatThreads: this.db.internalChatThreads || [],
      dataSubjectRequests: this.db.dataSubjectRequests || [],
      classes: this.db.classes || [],
      courses: Array.isArray(this.db.courses) ? this.db.courses : [],
      subjects: Array.isArray(this.db.subjects) ? this.db.subjects : [],
      notices: this.db.notices || [],
      notifications: Array.isArray(this.db.notifications) ? this.db.notifications : [],
      auditLogs: Array.isArray(this.db.auditLogs) ? this.db.auditLogs : [],
      events: Array.isArray(this.db.events) ? this.db.events : [],
      miniPautasStore: this.db.miniPautasStore || {}
    };
  }

  public getDatabase(): SchoolDatabase {
    return this.getSnapshot();
  }

  public getDb(): SchoolDatabase {
    return this.getSnapshot();
  }

  public getSettings(): InstitutionSettings {
    return this.db.settings || defaultSettings;
  }

  public getSyncStatus(): 'synced' | 'syncing' | 'offline' | 'error' {
    return this.syncStatus;
  }

  public subscribeSyncStatus(listener: (status: 'synced' | 'syncing' | 'offline' | 'error') => void): () => void {
    this.syncStatusListeners.add(listener);
    listener(this.syncStatus);
    return () => {
      this.syncStatusListeners.delete(listener);
    };
  }

  private setSyncStatus(status: 'synced' | 'syncing' | 'offline' | 'error') {
    this.syncStatus = status;
    this.syncStatusListeners.forEach((fn) => fn(status));
  }

  /** Junta o documento da escola vindo da nuvem ao estado local (só as chaves que o documento guarda). */
  private mergeRemoteDoc(remote: cloud.SchoolDoc) {
    // Isolamento por escola: a lista de utilizadores só pode ter contas DESTA escola (mais a sessão atual).
    // Antes, uma lista em cache de outra escola (mãe ↔ filial) ficava misturada com a desta.
    const cur = this.db.currentUser;
    const ofThisSchool = (list: any[] | undefined): any[] => {
      const out = (list || []).filter((u) => u && (u.id === cur?.id || !u.institutionId || u.institutionId === this.activeInstitutionId));
      return out;
    };
    const users = Array.isArray(remote.users) && remote.users.length > 0 ? ofThisSchool(remote.users) : ofThisSchool(this.db.users);
    this.db = {
      ...this.db,
      users,
      events: Array.isArray(remote.events) ? remote.events : this.db.events,
      auditLogs: Array.isArray(remote.auditLogs) ? remote.auditLogs : this.db.auditLogs,
      miniPautasStore: remote.miniPautasStore || this.db.miniPautasStore || {},
      pauta: Array.isArray(remote.pauta) ? remote.pauta : this.db.pauta,
      attendance: Array.isArray(remote.attendance) ? remote.attendance : this.db.attendance,
      settings: { ...this.db.settings, ...(remote.settings || {}) }
    } as SchoolDatabase;
  }

  /** Há sessão Supabase neste navegador? Sem ela nada se lê nem se grava na nuvem. */
  private async hasCloudSession(): Promise<boolean> {
    try { const { data } = await supabase.auth.getSession(); return !!data.session; } catch { return false; }
  }

  public async initRemoteSync(): Promise<void> {
    try {
      // Sem sessão não há nuvem: a leitura é feita logo a seguir ao login (restoreSession).
      if (!(await this.hasCloudSession())) { this.setSyncStatus('offline'); return; }
      this.setSyncStatus('syncing');

      const hasLocalDb =
        typeof window !== 'undefined' &&
        typeof localStorage !== 'undefined' &&
        (localStorage.getItem('escola_inst_' + this.activeInstitutionId) !== null || (this.activeInstitutionId === 'inst_bandmed' && localStorage.getItem(STORAGE_KEY) !== null));

      // IMPORTANTE: uma falha/tempo-limite na leitura NUNCA significa "a nuvem está vazia" — só que ainda não sabemos.
      // Em caso de erro apenas se volta a tentar; nunca se escreve.
      let remote: cloud.SchoolDoc | null = null;
      let readFailed = false;
      try {
        const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 8000));
        const result = await Promise.race([cloud.loadSchoolDoc(this.activeInstitutionId, { withUsers: true }), timeout]);
        if (result === 'timeout') readFailed = true; else remote = result;
      } catch {
        readFailed = true;
      }

      if (readFailed) {
        this.setSyncStatus('offline');
        this.scheduleRemoteSyncRetry();
        return;
      }

      if (remote) {
        // A nuvem é sempre a fonte de verdade no arranque; nunca se escreve nesta fase.
        this.mergeRemoteDoc(remote);
        this.lastSyncedTimestamp = remote.lastCloudSync || '';
        this.applyAccessOverlay();
        this.setSyncStatus('synced');
        this.notifyLocal();
      } else if (!hasLocalDb) {
        // Confirmado (não é palpite de tempo-limite) que a escola ainda não tem dados na nuvem.
        await this.pushToCloudStorage();
      }

      if (this.unsubscribeRealtime) {
        this.unsubscribeRealtime();
        this.unsubscribeRealtime = null;
      }

      // Escuta em tempo real as alterações feitas por outros postos.
      this.unsubscribeRealtime = cloud.listenSchoolDoc(
        this.activeInstitutionId,
        (doc) => {
          if (doc.lastCloudSync && doc.lastCloudSync !== this.lastSyncedTimestamp) {
            this.lastSyncedTimestamp = doc.lastCloudSync;
            this.mergeRemoteDoc(doc);
            this.applyAccessOverlay();
            this.setSyncStatus('synced');
            this.notifyLocal();
          }
        },
        (error) => { console.warn('Escuta do documento da escola:', error); },
        { withUsers: true }
      );

      // Dados por registo: só com sessão verificada (ver restoreSession).
      if (this.sessionVerified) await this.initShards();

    } catch (e) {
      console.warn('Ligação à nuvem em modo offline:', e);
      this.setSyncStatus('offline');
      this.scheduleRemoteSyncRetry();
    }
  }


  // ---------------------------------------------------------------------------
  // Dados por registo (inst_data/{instituição}/{colecção}/{id})
  // ---------------------------------------------------------------------------
  // As colecções de src/config/dataShards.json já não vão no documento único da escola:
  // cada registo é um nó próprio, com regras por perfil (RLS + collection_acl no Supabase, gerado a partir
  // do mesmo JSON por scripts/gen-supabase-acl.mjs), e só o que mudou é enviado. Lógica pura em src/utils/shardSync.ts.

  private shardMode = false;
  /** Só há sessão "verificada" depois de um login/restauro com sessão Supabase (o admin de demonstração não conta). */
  private sessionVerified = false;
  private shardBaseline: Record<string, Record<string, any>> = {};
  private shardUnsubs: Record<string, () => void> = {};
  private shardDeferred = new Set<string>();
  /** Colecções carregadas com edições locais por enviar: no 1.º envio nunca apagam registos que só existem na nuvem. */
  private shardSafe = new Set<string>();
  private shardInitRunning = false;

  public isShardMode(): boolean {
    return this.shardMode;
  }

  private setShardCollection(name: string, list: any[]) {
    (this.db as any)[name] = list;
    if (name === 'invoices') (this.db as any).tuitionFees = list;
  }

  /** Alunos: anexos grandes em base64 não seguem para a nuvem (mantém o comportamento do envio antigo). */
  private sanitizeStudentsForCloud(list: any[]): any[] {
    const small = (v?: string) => (v && v.length > 30000 ? '' : v);
    const file = (f: any) => (f ? { ...f, dataUrl: small(f.dataUrl) } : null);
    return (list || []).map((st) => ({
      ...st,
      docPassPhoto: small(st.docPassPhoto),
      docBiFile: file(st.docBiFile),
      docCertificateFile: file(st.docCertificateFile),
      additionalDocs: (st.additionalDocs || []).map((doc: any) => ({ ...doc, dataUrl: small(doc.dataUrl) }))
    }));
  }

  private async waitForAccess(maxMs = 5000): Promise<void> {
    if (this.db.currentUser?.role === 'admin') return;
    const start = Date.now();
    while (!this.accessLoaded && Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async initShards(): Promise<void> {
    const me = this.db.currentUser;
    if (!me || !this.sessionVerified || this.shardInitRunning) return;
    this.shardInitRunning = true;
    try {
      await this.waitForAccess();
      this.shardMode = true;
      if (me.role === 'aluno' || me.role === 'encarregado') {
        await this.loadUserProjection(me.id);
      } else {
        await this.loadShards();
        this.attachShardListeners();
      }
    } catch (e) {
      console.warn('Dados por registo: erro ao iniciar', e);
    } finally {
      this.shardInitRunning = false;
    }
  }

  private userProjectionUnsub: (() => void) | null = null;

  /**
   * Alunos e Encarregados: carregam a sua projecção individual de user_projections/{escola}/{userId}.
   * A base de dados (RLS) bloqueia-os de ler as colecções completas da escola, garantindo privacidade total.
   */
  private async loadUserProjection(userId: string): Promise<void> {
    const me = this.db.currentUser;
    if (!me) return;
    try {
      const proj = await cloud.loadProjection(this.activeInstitutionId, userId);
      if (proj) {
        this.applyUserProjection(proj as UserProjectionData);
      } else {
        const local = me.role === 'aluno' ? buildProjectionForAluno(me, this.db) : buildProjectionForEncarregado(me, this.db);
        this.applyUserProjection(local);
      }
    } catch (e) {
      console.warn('Erro ao carregar projecção de utilizador:', e);
      const local = me.role === 'aluno' ? buildProjectionForAluno(me, this.db) : buildProjectionForEncarregado(me, this.db);
      this.applyUserProjection(local);
    }
    this.attachUserProjectionListener(userId);
    this.applyAccessOverlay();
    this.notifyLocal();
  }

  private applyUserProjection(proj: Partial<UserProjectionData>) {
    if (!proj) return;
    if (Array.isArray(proj.students)) this.db.students = proj.students;
    if (Array.isArray(proj.matriculas)) this.db.matriculas = proj.matriculas;
    if (Array.isArray(proj.classes)) this.db.classes = proj.classes;
    if (Array.isArray(proj.invoices)) {
      this.db.invoices = proj.invoices;
      (this.db as any).tuitionFees = proj.invoices;
    }
    if (Array.isArray(proj.guardianLinks)) this.db.guardianLinks = proj.guardianLinks;
    if (Array.isArray(proj.homologations)) (this.db as any).homologations = proj.homologations;
    if (Array.isArray(proj.attendanceSheets)) this.db.attendanceSheets = proj.attendanceSheets;
    if (Array.isArray(proj.inscricoesUC)) this.db.inscricoesUC = proj.inscricoesUC;
    if (Array.isArray(proj.monografiasTCC)) this.db.monografiasTCC = proj.monografiasTCC;
    if (Array.isArray(proj.estagiosCurriculares)) this.db.estagiosCurriculares = proj.estagiosCurriculares;
    if (Array.isArray(proj.bolsasEstudo)) this.db.bolsasEstudo = proj.bolsasEstudo;
    if (Array.isArray(proj.diplomasSuperior)) this.db.diplomasSuperior = proj.diplomasSuperior;
  }

  private attachUserProjectionListener(userId: string) {
    if (this.userProjectionUnsub) {
      try { this.userProjectionUnsub(); } catch { /* ignora */ }
      this.userProjectionUnsub = null;
    }
    this.userProjectionUnsub = cloud.listenProjection(
      this.activeInstitutionId,
      userId,
      (data) => {
        this.applyUserProjection(data as UserProjectionData);
        this.applyAccessOverlay();
        this.notifyLocal();
      },
      (err) => console.warn('Listener de projecção de utilizador:', err)
    );
  }

  /**
   * Actualiza na nuvem as projecções individuais de todos os alunos e encarregados da instituição.
   * Só a equipa de gestão (admin/director/secretaria/financeiro) tem permissão de escrita.
   */
  private async pushUserProjections(): Promise<void> {
    const me = this.db.currentUser;
    if (!me || (me.role !== 'admin' && me.role !== 'director' && me.role !== 'secretaria' && me.role !== 'financeiro')) {
      return;
    }
    try {
      const projections = buildAllUserProjections(this.db);
      const clean: Record<string, any> = {};
      for (const [uid, proj] of Object.entries(projections)) clean[uid] = shardStripUndefined(proj);
      if (Object.keys(clean).length === 0) return;
      await cloud.saveProjections(this.activeInstitutionId, clean);
    } catch (e) {
      console.warn('Erro ao atualizar projeções por utilizador na nuvem:', e);
    }
  }

  /** Consulta paginada no servidor (só colecções já no Supabase). Ecrãs novos usam isto em vez de carregar a lista toda. */
  public async queryRecordsPage(collection: string, q: PageQuery = {}): Promise<{ rows: any[]; total: number }> {
    return sbPage(collection, q);
  }

  // ---- Todas as colecções vivem na tabela `records` do Supabase ----
  private async shardGet(name: string, year?: string): Promise<Record<string, any>> {
    return sbLoad(name, year);
  }

  private shardListen(name: string, year: string | undefined, onMap: (m: Record<string, any>) => void, onErr: (e: any) => void): () => void {
    return sbListen(name, year, onMap, onErr);
  }

  private async shardWrite(name: string, batch: Record<string, any>): Promise<void> {
    return sbPush(name, batch);
  }

  /** Carrega colecções de dados por registo; as colecções anuais são carregadas pelo ano lectivo activo. */
  private async loadShards(targetYear?: string): Promise<void> {
    const actor = this.db.currentUser as any;
    const apply = !this.hasPendingLocalChanges;
    const activeYear = targetYear || this.db.settings?.currentAcademicYear || getFallbackAcademicYear();
    await Promise.all(
      SHARD_KEYS.map(async (name) => {
        if (!canReadCollection(name, actor)) {
          delete this.shardBaseline[name];
          if (apply) this.setShardCollection(name, []);
          return;
        }
        try {
          const map = await this.shardGet(name, isYearScopedCollection(name) && activeYear ? activeYear : undefined);
          this.shardBaseline[name] = map;
          if (apply) this.setShardCollection(name, fromRecordMap(map));
          else this.shardSafe.add(name);
        } catch (e) {
          console.warn(`Dados por registo: sem leitura de "${name}"`, e);
          delete this.shardBaseline[name];
          // Sem leitura (sessão/permissão): não se mostra uma cópia antiga que seria editada por engano.
          if (apply) this.setShardCollection(name, []);
        }
      })
    );
    this.applyAccessOverlay();
    this.notifyLocal();
  }

  private attachShardListeners(targetYear?: string) {
    const actor = this.db.currentUser as any;
    const activeYear = targetYear || this.db.settings?.currentAcademicYear || getFallbackAcademicYear();
    for (const name of SHARD_KEYS) {
      const readable = canReadCollection(name, actor) && this.shardBaseline[name] !== undefined;
      const attached = !!this.shardUnsubs[name];
      if (!readable && attached) {
        this.shardUnsubs[name]();
        delete this.shardUnsubs[name];
      }
      if (!readable || attached) continue;

      const isYearScoped = isYearScopedCollection(name);
      this.shardUnsubs[name] = this.shardListen(
        name,
        isYearScoped && activeYear ? activeYear : undefined,
        (map: Record<string, any>) => {
          if (shardDeepEqual(map, this.shardBaseline[name])) return;
          if (this.hasPendingLocalChanges) {
            // há edições locais por enviar: aplica depois do envio, para não as perder
            this.shardDeferred.add(name);
            return;
          }
          this.shardBaseline[name] = map;
          this.setShardCollection(name, fromRecordMap(map));
          this.applyAccessOverlay();
          this.notifyLocal();
        },
        (error: any) => console.warn(`Dados por registo: listener de "${name}"`, error)
      );
    }
  }

  /**
   * Recarrega as colecções que dependem do ano lectivo (matrículas, turmas, faturas, pautas, etc.)
   * ao alternar o ano no seletor do cabeçalho.
   */
  public async reloadYearScopedShards(newYear: string): Promise<void> {
    if (!this.shardMode) return;
    const actor = this.db.currentUser as any;
    if (actor?.role === 'aluno' || actor?.role === 'encarregado') {
      await this.loadUserProjection(actor.id);
      return;
    }
    const yearKeys = SHARD_KEYS.filter((k) => isYearScopedCollection(k));
    await Promise.all(
      yearKeys.map(async (name) => {
        if (!canReadCollection(name, actor)) return;
        if (this.shardUnsubs[name]) {
          try { this.shardUnsubs[name](); } catch { /* ignore */ }
          delete this.shardUnsubs[name];
        }
        try {
          const map = await this.shardGet(name, newYear);
          this.shardBaseline[name] = map;
          this.setShardCollection(name, fromRecordMap(map));

          this.shardUnsubs[name] = this.shardListen(
            name,
            newYear,
            (m: Record<string, any>) => {
              if (shardDeepEqual(m, this.shardBaseline[name])) return;
              if (this.hasPendingLocalChanges) {
                this.shardDeferred.add(name);
                return;
              }
              this.shardBaseline[name] = m;
              this.setShardCollection(name, fromRecordMap(m));
              this.applyAccessOverlay();
              this.notifyLocal();
            },
            (error: any) => console.warn(`Dados por registo: listener de "${name}" (${newYear})`, error)
          );
        } catch (e) {
          console.warn(`Erro ao carregar ano letivo ${newYear} para ${name}:`, e);
        }
      })
    );
    this.applyAccessOverlay();
    this.notifyLocal();
  }

  private detachShards() {
    for (const k of Object.keys(this.shardUnsubs)) {
      try { this.shardUnsubs[k](); } catch { /* ignora */ }
    }
    this.shardUnsubs = {};
    this.shardBaseline = {};
    this.shardDeferred.clear();
    this.shardSafe.clear();
    if (this.userProjectionUnsub) {
      try { this.userProjectionUnsub(); } catch { /* ignora */ }
      this.userProjectionUnsub = null;
    }
    this.shardMode = false;
  }

  /** Envia só o que mudou, colecção a colecção, respeitando o que as regras permitem a este perfil. */
  private async pushShards(): Promise<boolean> {
    const actor = this.db.currentUser as any;
    const results = await Promise.allSettled(
      SHARD_KEYS.map(async (name) => {
        const base = this.shardBaseline[name];
        if (base === undefined) return; // nunca foi lida (sem acesso): nunca se escreve
        let list = (this.db as any)[name];
        if (!Array.isArray(list)) return;
        // Colecções anuais (faturas, matrículas, planos…): todo o registo TEM de levar o ano lectivo.
        // Sem ele a linha fica com academic_year = NULL e o filtro por ano esconde-a no próximo refresh
        // (era o que fazia as propinas/matrícula "desaparecerem" ao fim de ~30 s).
        if (isYearScopedCollection(name)) {
          const year = this.db.settings?.currentAcademicYear || getFallbackAcademicYear();
          if (year && list.some((r: any) => r && !r.academicYear)) {
            list = list.map((r: any) => (r && !r.academicYear ? { ...r, academicYear: year } : r));
            this.setShardCollection(name, list);
          }
        }
        if (!isShardable(list)) {
          console.warn(`Dados por registo: "${name}" tem registos sem id; não foi enviada.`);
          return;
        }
        if (name === 'students') list = this.sanitizeStudentsForCloud(list);
        const { updates } = diffCollection(base, list);
        let allowed = filterUpdatesForActor(name, updates, actor);
        const dropped = Object.keys(updates).length - Object.keys(allowed).length;
        if (dropped > 0) console.warn(`Dados por registo: ${dropped} alteração(ões) em "${name}" não são permitidas a este perfil e não foram enviadas.`);
        const safe = this.shardSafe.has(name);
        if (safe) {
          // cache antiga + edições offline: não apagar o que só a nuvem conhece
          allowed = Object.fromEntries(Object.entries(allowed).filter(([path, v]) => !(v === null && !path.includes('/'))));
        }
        for (const batch of chunkUpdates(shardStripUndefined(allowed), 200)) {
          await this.shardWrite(name, batch);
        }
        this.shardBaseline[name] = applyUpdates(base, allowed);
        if (safe) {
          // a lista local passa a ser a nuvem + as edições enviadas
          this.shardSafe.delete(name);
          this.setShardCollection(name, fromRecordMap(this.shardBaseline[name]));
        }
      })
    );
    // Sincroniza projeções individuais após alterações
    void this.pushUserProjections();
    return results.every((r) => r.status === 'fulfilled');
  }

  /** Remotos que chegaram durante um envio: vai buscá-los agora que as edições locais já seguiram. */
  private async applyDeferredShards() {
    if (this.shardDeferred.size === 0 || this.hasPendingLocalChanges) return;
    const names = Array.from(this.shardDeferred);
    this.shardDeferred.clear();
    for (const name of names) {
      try {
        const map = await this.shardGet(name, isYearScopedCollection(name) ? (this.db.settings?.currentAcademicYear || getFallbackAcademicYear()) : undefined);
        if (shardDeepEqual(map, this.shardBaseline[name])) continue;
        this.shardBaseline[name] = map;
        this.setShardCollection(name, fromRecordMap(map));
      } catch { /* tenta no próximo ciclo */ }
    }
    this.applyAccessOverlay();
    this.notifyLocal();
  }

  /**
   * Retries a failed/timed-out `initRemoteSync()` (the initial cloud read + realtime
   * listener setup) with a short fixed delay. This only ever re-reads and re-subscribes —
   * it never writes — so retrying repeatedly is always safe.
   */
  private scheduleRemoteSyncRetry() {
    if (this.remoteSyncRetryTimer) return;
    this.remoteSyncRetryTimer = setTimeout(() => {
      this.remoteSyncRetryTimer = null;
      this.initRemoteSync();
    }, 4000);
  }

  // ---------------------------------------------------------------------------
  // Acesso protegido (access_control)
  // ---------------------------------------------------------------------------

  /** Aplica o acesso vindo de `access_control` aos utilizadores em memória. */
  private applyAccessOverlay() {
    const me = this.db.currentUser;
    const isAdmin = me?.role === 'admin';
    const withAccess = (u: User): User => {
      const a = this.accessMap[u.id];
      if (a !== undefined) {
        return { ...u, access: a || undefined } as User;
      }
      return u;
    };
    // Migração: acessos antigos (gravados em users/*) passam para o nó protegido.
    if (isAdmin) {
      for (const u of this.db.users || []) {
        const legacy = (u as any).access as UserAccess | undefined;
        if (legacy?.sections && Object.keys(legacy.sections).length > 0 && this.accessMap[u.id] === undefined) {
          this.accessMap[u.id] = legacy;
          this.writeUserAccess(u.id, legacy).catch(() => {});
        }
      }
    }
    if (Array.isArray(this.db.users)) this.db.users = this.db.users.map(withAccess);
    if (me) {
      const myAccess = this.accessMap[me.id] || me.access;
      if (myAccess !== undefined) {
        this.db.currentUser = { ...me, access: myAccess || undefined };
      }
    }
  }

  private async writeUserAccess(userId: string, access: UserAccess | null): Promise<void> {
    await cloud.saveAccess(this.activeInstitutionId, userId, access ? (stripUndefinedDeep(access) as any) : null);
  }

  /**
   * Liga a escuta em tempo real do acesso. O admin escuta a instituição inteira;
   * os restantes só o seu próprio registo. Resolve depois da 1.ª leitura (ou 5 s),
   * para a sessão abrir já com o acesso certo.
   */
  public startAccessSync(): Promise<void> {
    this.stopAccessSync();
    const me = this.db.currentUser;
    if (!me) return Promise.resolve();

    // Carrega cache local se a accessMap estiver vazia
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('escola_access_map_' + this.activeInstitutionId);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            this.accessMap = { ...parsed, ...this.accessMap };
            this.applyAccessOverlay();
          }
        }
      } catch {
        // ignore
      }
    }

    const isAdmin = me.role === 'admin';
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const timer = setTimeout(finish, 4000);
      try {
        this.unsubscribeAccess = cloud.listenAccess(
          this.activeInstitutionId,
          isAdmin ? undefined : me.id,
          (map) => {
            if (isAdmin) {
              this.accessMap = { ...map };
            } else if (map[me.id]) {
              this.accessMap[me.id] = map[me.id];
            }
            this.accessLoaded = true;
            this.applyAccessOverlay();
            this.notifyLocal();
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
              try {
                localStorage.setItem('escola_access_map_' + this.activeInstitutionId, JSON.stringify(this.accessMap));
              } catch {
                // ignore
              }
            }
            clearTimeout(timer);
            finish();
          },
          (error) => {
            console.warn('Escuta do acesso por utilizador:', error);
            clearTimeout(timer);
            finish();
          }
        );
      } catch (e) {
        console.warn('Erro ao ligar access_control:', e);
        clearTimeout(timer);
        finish();
      }
    });
  }

  public stopAccessSync() {
    if (this.unsubscribeAccess) {
      this.unsubscribeAccess();
      this.unsubscribeAccess = null;
    }
    // Não limpa this.accessMap para não perder permissões em memória durante transição
    this.accessLoaded = false;
  }

  /** Só o Administrador grava acessos (a base de dados também o exige). */
  public async saveUserAccess(userId: string, access: UserAccess | null): Promise<{ success: boolean; error?: string }> {
    if (this.db.currentUser?.role !== 'admin') {
      return { success: false, error: 'Apenas o Administrador pode alterar acessos.' };
    }
    try {
      this.accessMap[userId] = access || undefined;
      this.accessLoaded = true;
      if (this.db.users) {
        this.db.users = this.db.users.map((u) => (u.id === userId ? { ...u, access: access || undefined } : u));
      }
      if (this.db.currentUser?.id === userId) {
        this.db.currentUser = { ...this.db.currentUser, access: access || undefined };
      }
      this.applyAccessOverlay();
      this.notifyLocal();
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('escola_access_map_' + this.activeInstitutionId, JSON.stringify(this.accessMap));
        } catch {
          // ignore
        }
      }
      this.writeUserAccess(userId, access).catch((err) => {
        console.warn('Erro ao sincronizar access_control na nuvem:', err);
      });
      return { success: true };
    } catch (e: any) {
      console.warn('Erro ao gravar access_control:', e);
      return { success: false, error: 'Não foi possível guardar os acessos.' };
    }
  }

  /**
   * Actualiza os dados de apresentação do perfil (nome, telefone, avatar...). Nunca cria contas nem muda papel/escola:
   * isso só o servidor faz (Edge Functions + gatilho profiles_guard).
   */
  public async saveUserToCloud(user: User): Promise<void> {
    try {
      if (!user?.id) return;
      const { password: _omitPassword, access: _omitAccess, ...rest } = user as any;
      await cloud.updateProfile(stripUndefinedDeep({ ...rest, email: (user.email || '').trim().toLowerCase() }) as any);
    } catch (e) {
      console.warn('Erro ao guardar o perfil do utilizador:', e);
    }
  }

  private pushInFlight: Promise<boolean> | null = null;
  private pushQueued = false;

  /**
   * Envia para a nuvem UM de cada vez. Antes, cada alteração agendava um envio novo mesmo com outro ainda a
   * correr (e com a base lenta, vários em simultâneo): todos leem a mesma versão do registo e o servidor
   * rejeitava os repetidos com "Conflito de versão" (40001) — dezenas por segundo — o que sobrecarregava o
   * Supabase (504 no login). Agora os pedidos concorrentes juntam-se: corre o actual e, se houve novas
   * alterações entretanto, faz mais um envio no fim. Entre separadores do mesmo navegador usa-se um lock.
   */
  public pushToCloudStorage(): Promise<boolean> {
    if (this.pushInFlight) {
      this.pushQueued = true;
      return this.pushInFlight;
    }
    const run = async (): Promise<boolean> => {
      const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
      try {
        if (locks?.request) {
          return await locks.request(`bandmed-push-${this.activeInstitutionId}`, () => this.pushToCloudStorageNow());
        }
        return await this.pushToCloudStorageNow();
      } finally {
        this.pushInFlight = null;
        if (this.pushQueued) {
          this.pushQueued = false;
          void this.pushToCloudStorage();
        }
      }
    };
    this.pushInFlight = run();
    return this.pushInFlight;
  }

  private async pushToCloudStorageNow(): Promise<boolean> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      this.setSyncStatus('syncing');
      const timestamp = new Date().toISOString();

      // Sem sessão Supabase não há nada a enviar: fica pendente até haver login.
      if (!(await this.hasCloudSession())) {
        this.setSyncStatus('offline');
        this.hasPendingLocalChanges = true;
        return false;
      }

      const isAdminSession = this.db.currentUser?.role === 'admin';
      // Documento da escola: só as chaves que ele guarda; a base de dados (RLS) decide o que cada perfil pode escrever.
      const stamp = await cloud.saveSchoolDoc(this.activeInstitutionId, {
        settings: this.db.settings || {},
        events: this.db.events || defaultEvents,
        auditLogs: this.db.auditLogs || defaultAuditLogs,
        miniPautasStore: this.db.miniPautasStore || {},
        // A tabela institution_docs só aceita ARRAY em pauta/attendance. Se o estado local ainda for o
        // objecto "rascunho" por omissão, não se envia (evita o erro 23514 institution_docs_shape).
        pauta: Array.isArray(this.db.pauta) ? this.db.pauta : undefined,
        attendance: Array.isArray(this.db.attendance) ? this.db.attendance : undefined
      } as any);
      if (stamp) this.lastSyncedTimestamp = stamp;

      if (this.shardMode) {
        const shardsOk = await this.pushShards();
        if (!shardsOk) throw new Error('Falha ao enviar dados por registo');
      }

      // Anos lectivos cadastrados, em leitura pública, para o seletor do link de Pré-Matrícula
      // (o candidato não tem sessão e não pode ler o documento da instituição).
      if (isAdminSession) {
        const years = buildAcademicYearList(this.db.settings as any);
        if (years.length > 0) {
          cloud.savePublicYears(this.activeInstitutionId, this.db.settings?.currentAcademicYear || years[0], years).catch(() => {});
        }
      }

      // Regista localmente o carimbo temporal sincronizado. Sem isto, `this.db.lastCloudSync`
      // ficava permanentemente vazio e qualquer cópia remota (mesmo mais antiga) era tratada
      // como mais recente no arranque seguinte, sobrepondo-se aos dados locais.
      this.db.lastCloudSync = this.lastSyncedTimestamp || timestamp;

      this.setSyncStatus('synced');
      this.retryAttempts = 0;
      this.hasPendingLocalChanges = false;
      void this.applyDeferredShards();
      return true;
    } catch (e) {
      console.warn('Erro ao sincronizar com a nuvem:', e);
      this.setSyncStatus('offline');
      this.hasPendingLocalChanges = true;
      this.scheduleRetry();
      return false;
    }
  }

  /**
   * Backoff retry for a failed `pushToCloudStorage()`. Without this, a single
   * transient failure (the tab closing mid-write, a brief network drop, the
   * Realtime Database timing out) permanently strands that change in
   * IndexedDB/localStorage on this device: nothing else ever tries again until
   * the next local mutation happens to call `notify()`, which may never come
   * (e.g. the person only opened the app to submit that one request). Capped
   * exponential backoff keeps retrying in the background until it succeeds or
   * the tab closes.
   */
  /** Anos lectivos cadastrados da instituição activa, para o link público (sem sessão). */
  public async fetchPublicAcademicYears(): Promise<{ current: string; years: string[] } | null> {
    try {
      const v = await cloud.fetchPublicYears(this.activeInstitutionId);
      if (!v || !v.years) return null;
      const years: string[] = (Array.isArray(v.years) ? v.years : Object.values(v.years)).filter(Boolean) as string[];
      return years.length ? { current: String(v.current || years[0]), years } : null;
    } catch {
      return null;
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this.retryAttempts));
    this.retryAttempts += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.pushToCloudStorage();
    }, delay);
  }

  private scheduleSync() {
    this.hasPendingLocalChanges = true;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.pushToCloudStorage();
    }, 600);
  }

  public subscribe(listener: (db: SchoolDatabase) => void): () => void {
    this.listeners.add(listener);
    listener(this.getDatabase());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyLocal() {
    // 1. Asynchronously persist complete database (including high-res files & attachments) to IndexedDB
    idbService.save(this.db).catch(() => {});

    // 2. Persist to localStorage with intelligent quota-safe fallback & institution isolation
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const fullJson = JSON.stringify(this.db);
        localStorage.setItem('escola_inst_' + this.activeInstitutionId, fullJson);

        if (this.activeInstitutionId === 'inst_bandmed') {
          if (fullJson.length < 2000000) {
            localStorage.setItem(STORAGE_KEY, fullJson);
          } else {
            const safeJson = prepareSafeLocalStorageSnapshot(this.db);
            localStorage.setItem(STORAGE_KEY, safeJson);
          }
        }
      } catch {
        try {
          // Attempt sanitized snapshot if full string exceeded quota
          const safeJson = prepareSafeLocalStorageSnapshot(this.db);
          localStorage.setItem('escola_inst_' + this.activeInstitutionId, safeJson);
          if (this.activeInstitutionId === 'inst_bandmed') {
            localStorage.setItem(STORAGE_KEY, safeJson);
          }
        } catch {
          // If still constrained by browser quota, save core records without crashing
          try {
            const compactSnapshot = {
              currentUser: this.db.currentUser,
              settings: this.db.settings,
              users: this.db.users,
              classes: this.db.classes,
              subjects: this.db.subjects,
              courses: this.db.courses
            };
            localStorage.setItem('escola_inst_' + this.activeInstitutionId, JSON.stringify(compactSnapshot));
            if (this.activeInstitutionId === 'inst_bandmed') {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(compactSnapshot));
            }
          } catch {
            // Silently handled: IndexedDB has already persisted full data safely
          }
        }
      }
    }
    const currentData = this.getDatabase();
    this.listeners.forEach((listener) => listener(currentData));
  }

  private notify() {
    this.notifyLocal();
    this.scheduleSync();
    this.scheduleAdmissionStatusSync();
  }

  // Multi-Tenancy & Institution Management
  public getInstitutionsIndex(): InstitutionSummary[] {
    const defaultList: InstitutionSummary[] = [
      {
        id: 'inst_bandmed',
        name: 'Complexo Escolar Privado BandMed',
        adminEmail: 'admin@escola.pt',
        adminName: 'Dr. Carlos Mendes',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
    ];

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('escola_institutions_index');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('Erro ao ler índice de instituições:', e);
      }
    }
    return defaultList;
  }

  /** A escola é criada no servidor (Edge Function register-institution); aqui só se guarda a cópia local do índice. */
  public async saveInstitutionSummary(summary: InstitutionSummary): Promise<void> {
    const list = this.getInstitutionsIndex();
    const idx = list.findIndex((i) => i.id === summary.id);
    const updated = idx >= 0 ? list.map((i, n) => (n === idx ? summary : i)) : [...list, summary];
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('escola_institutions_index', JSON.stringify(updated));
      } catch (e) {
        console.warn('Erro ao salvar índice de instituições:', e);
      }
    }
  }

  public async registerInstitutionAndAdmin(
    adminData: {
      name: string;
      email: string;
      password: string;
      captchaToken: string;
      termsAccepted: boolean;
      termsVersion: string;
      avatar?: string;
      username?: string;
    },
    institutionData?: Partial<InstitutionSettings>
  ): Promise<{ success: boolean; institutionId: string; user: User; error?: string }> {
    const fail = (error: string) => ({ success: false as const, error, user: undefined as any, institutionId: '' });
    const cleanEmail = adminData.email.trim().toLowerCase();
    const cleanName = adminData.name.trim();
    const pw = (adminData.password || '').trim();

    if (!cleanName) return fail('Por favor, indique o nome do Administrador.');
    if (!cleanEmail) return fail('Por favor, indique o e-mail institucional.');
    if (pw.length < 10) return fail('A palavra-passe deve conter pelo menos 10 caracteres.');
    if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return fail('A palavra-passe deve ter maiúsculas, minúsculas e números.');

    if (!adminData.termsAccepted) return fail('Tem de aceitar os Termos de Utilização e a Política de Privacidade.');

    // Escola + administrador são criados no servidor (registo livre, 30 dias de teste).
    const created = await cloud.registerInstitutionViaServer({
      schoolName: institutionData?.schoolName || 'Nova Instituição',
      adminName: cleanName,
      adminEmail: cleanEmail,
      password: pw,
      captchaToken: adminData.captchaToken,
      termsAccepted: adminData.termsAccepted,
      termsVersion: adminData.termsVersion,
      nif: institutionData?.nif || undefined
    });
    if (!created.success || !created.institutionId || !created.userId) {
      return fail(created.error || 'Não foi possível criar a escola.');
    }
    const newInstId = created.institutionId;

    // A função de registo já validou o captcha e devolve um token de uso único para abrir sessão sem novo captcha.
    setRemembered(true);
    touchActivity(true);
    const signInResult = created.tokenHash ? await signInWithTokenHash(created.tokenHash) : await signIn(cleanEmail, pw);
    if (!signInResult.success) {
      return fail(signInResult.error || 'Conta criada, mas não foi possível iniciar sessão automaticamente. Tente entrar manualmente.');
    }

    const adminUser: User = {
      id: created.userId,
      name: cleanName,
      email: cleanEmail,
      username: adminData.username?.trim() || cleanEmail.split('@')[0],
      role: 'admin',
      roleTitle: 'Administrador Geral',
      avatar: adminData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      institutionId: newInstId
    };

    const cleanDb = createCleanInstitutionDb(newInstId, adminUser, institutionData);

    const summary: InstitutionSummary = {
      id: newInstId,
      name: institutionData?.schoolName || 'Nova Instituição',
      adminEmail: cleanEmail,
      adminName: cleanName,
      createdAt: new Date().toISOString()
    };

    if (this.unsubscribeRealtime) {
      this.unsubscribeRealtime();
      this.unsubscribeRealtime = null;
    }
    this.detachShards();
    this.sessionVerified = true;

    this.activeInstitutionId = newInstId;
    this.db = cleanDb;

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('escola_active_institution_id', newInstId);
        localStorage.setItem('escola_inst_' + newInstId, JSON.stringify(cleanDb));
        // A sessão local (bandmed_session_user) só é guardada depois de confirmar o 2FA (LoginView).
      } catch (e) {
        console.warn('Erro ao salvar nova instituição no localStorage:', e);
      }
    }

    // Dados de apresentação do perfil do administrador (username, avatar...)
    await this.saveUserToCloud(adminUser);
    await this.saveInstitutionSummary(summary);
    // Envia as definições iniciais da escola e liga a escuta em tempo real
    await this.pushToCloudStorage();
    await this.initRemoteSync();
    this.notifyLocal();

    return { success: true, institutionId: newInstId, user: adminUser };
  }

  public async switchInstitution(institutionId: string, opts: { sync?: boolean } = {}): Promise<boolean> {
    if (this.activeInstitutionId === institutionId) return true;

    if (this.unsubscribeRealtime) {
      this.unsubscribeRealtime();
      this.unsubscribeRealtime = null;
    }
    this.detachShards();

    this.activeInstitutionId = institutionId;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('escola_active_institution_id', institutionId);
      const savedInst = localStorage.getItem('escola_inst_' + institutionId);
      if (savedInst) {
        try {
          this.db = JSON.parse(savedInst);
          this.notifyLocal();
        } catch (e) {
          console.warn('Erro ao carregar instituição local:', e);
        }
      }
    }

    if (opts.sync !== false) {
      this.initRemoteSync();
      if (this.db.currentUser) this.startAccessSync().catch(() => {});
    }
    return true;
  }

  // User Management
  public getUsers(): User[] {
    return this.db.users || [];
  }

  public async addUser(userData: {
    name: string;
    email: string;
    role: UserRole;
    roleTitle?: string;
    avatar?: string;
    phone?: string;
    processNumber?: string;
    password: string;
    username?: string;
    autoGeneratedEmail?: boolean;
    linkedTeacherId?: string;
    linkedStudentId?: string;
    linkedFuncionarioId?: string;
  }): Promise<User> {
    const roleTitleMap: Record<string, string> = {
      admin: 'Administrador Geral',
      director: 'Direção Pedagógica',
      secretaria: 'Secretaria Escolar',
      professor: 'Corpo Docente',
      financeiro: 'Tesouraria & Finanças',
      aluno: 'Estudante',
      encarregado: 'Encarregado de Educação',
      funcionario: 'Funcionário da Escola'
    };

    const cleanEmail = userData.email.trim().toLowerCase();

    // A conta é criada no servidor (Edge Function create-user): a palavra-passe só existe no Supabase Auth.
    const authResult = await cloud.createAccountViaServer({
      email: cleanEmail,
      password: userData.password,
      name: userData.name.trim(),
      role: userData.role,
      phone: userData.phone || undefined,
      username: userData.username?.trim() || undefined,
      processNumber: userData.processNumber || undefined,
      avatar: userData.avatar || undefined,
      roleTitle: userData.roleTitle || roleTitleMap[userData.role] || undefined,
      linkedStudentId: userData.linkedStudentId || undefined,
      linkedTeacherId: userData.linkedTeacherId || undefined,
      linkedFuncionarioId: userData.linkedFuncionarioId || undefined
    }, this.activeInstitutionId);
    if (!authResult.success || !authResult.uid) {
      throw new Error(authResult.error || 'Não foi possível criar a conta de acesso deste utilizador.');
    }

    const newUser: User = {
      id: authResult.uid,
      name: userData.name.trim(),
      email: cleanEmail,
      username: userData.username?.trim() || cleanEmail.split('@')[0],
      role: userData.role,
      roleTitle: userData.roleTitle || roleTitleMap[userData.role] || 'Utilizador',
      // Marca o início da contagem da validade da credencial (política de segurança).
      passwordUpdatedAt: new Date().toISOString(),
      avatar: userData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      phone: userData.phone || '',
      processNumber: userData.processNumber || '',
      institutionId: this.activeInstitutionId,
      autoGeneratedEmail: userData.autoGeneratedEmail || undefined,
      linkedTeacherId: userData.linkedTeacherId || undefined,
      linkedStudentId: userData.linkedStudentId || undefined,
      linkedFuncionarioId: userData.linkedFuncionarioId || undefined
    };

    const currentUsers = this.db.users || [];
    this.db.users = [newUser, ...currentUsers];

    // Completa os dados de apresentação do perfil (a conta já existe no servidor)
    await this.saveUserToCloud(newUser);

    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action: 'Criação de Utilizador',
      details: `Novo utilizador "${newUser.name}" (${newUser.roleTitle}) registado com o perfil [${newUser.role}].`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });

    this.notify();
    return newUser;
  }

  /**
   * Cria, num único passo, a conta de acesso de um Aluno e, automaticamente, a
   * conta do respectivo Encarregado de Educação (caso ainda não exista uma).
   *
   * Regras de geração automática de e-mail (quando o campo correspondente não
   * estiver preenchido na ficha do aluno):
   *  - Encarregado de Educação: nomedoencarregado@encarregadoed.com
   *  - Aluno: nomedoaluno+numerodeprocesso@gmail.com
   *
   * O e-mail gerado é também gravado de volta na ficha do aluno, para manter a
   * base de dados consistente. A conta do Encarregado recebe uma palavra-passe
   * temporária (gerada automaticamente quando não for indicada), a comunicar
   * ao titular — que pode depois defini-la de novo através do link de
   * redefinição de palavra-passe.
   */
  public async createStudentAndGuardianAccounts(params: {
    studentId: string;
    studentPassword: string;
    guardianPassword?: string;
  }): Promise<{
    studentUser: User;
    guardianUser: User | null;
    guardianCreated: boolean;
    guardianPassword?: string;
    studentEmailWasGenerated: boolean;
    guardianEmailWasGenerated: boolean;
  }> {
    const student = (this.db.students || []).find((s) => s.id === params.studentId);
    if (!student) {
      throw new Error('Aluno não encontrado na base de dados.');
    }

    const alreadyHasStudentUser = (this.db.users || []).some(
      (u) => u.role === 'aluno' && u.linkedStudentId === student.id
    );
    if (alreadyHasStudentUser) {
      throw new Error('Este aluno já possui uma conta de utilizador criada.');
    }

    // 1. Conta do Aluno
    let studentEmail = (student.email || '').trim();
    let studentEmailWasGenerated = false;
    if (!studentEmail) {
      studentEmail = generateStudentAutoEmail(student.name, student.procNumber);
      studentEmailWasGenerated = true;
    }

    const studentUser = await this.addUser({
      name: student.name,
      email: studentEmail,
      role: 'aluno',
      roleTitle: 'Estudante',
      avatar: student.avatar,
      processNumber: student.procNumber,
      password: params.studentPassword,
      autoGeneratedEmail: studentEmailWasGenerated,
      linkedStudentId: student.id
    });

    if (studentEmailWasGenerated) {
      this.updateStudent(student.id, { email: studentEmail });
    }

    // 2. Conta do Encarregado de Educação (automática, apenas se ainda não existir)
    let guardianUser: User | null = null;
    let guardianEmailWasGenerated = false;
    let guardianPasswordUsed: string | undefined;

    const alreadyHasGuardianUser = (this.db.users || []).some(
      (u) => u.role === 'encarregado' && u.linkedStudentId === student.id
    );

    if (!alreadyHasGuardianUser && student.guardianName && student.guardianName.trim()) {
      let guardianEmail = (student.guardianEmail || '').trim();
      if (!guardianEmail) {
        guardianEmail = generateGuardianAutoEmail(student.guardianName);
        guardianEmailWasGenerated = true;
      }
      guardianPasswordUsed = (params.guardianPassword || '').trim() || generateTempPassword();

      try {
        guardianUser = await this.addUser({
          name: student.guardianName,
          email: guardianEmail,
          role: 'encarregado',
          roleTitle: 'Encarregado de Educação',
          phone: student.guardianPhone,
          password: guardianPasswordUsed,
          autoGeneratedEmail: guardianEmailWasGenerated,
          linkedStudentId: student.id
        });

        if (guardianEmailWasGenerated) {
          this.updateStudent(student.id, { guardianEmail });
        }
      } catch (guardianError) {
        // Se o e-mail do encarregado já estiver em uso por outra conta (ex.: já
        // é utilizador de outro educando), a conta do aluno mantém-se criada,
        // mas o erro é reportado para o administrador tratar manualmente.
        throw new Error(
          `Conta do aluno criada com sucesso, mas não foi possível criar automaticamente a conta do Encarregado de Educação: ${
            (guardianError as Error)?.message || 'erro desconhecido'
          }`
        );
      }
    }

    return {
      studentUser,
      guardianUser,
      guardianCreated: !!guardianUser,
      guardianPassword: guardianUser ? guardianPasswordUsed : undefined,
      studentEmailWasGenerated,
      guardianEmailWasGenerated
    };
  }

  /** Envia ao utilizador um e-mail com o link para definir nova palavra-passe (o administrador nunca a define). */
  public async resetUserPassword(email: string): Promise<{ success: boolean; error?: string }> {
    return sendPasswordReset(email);
  }

  public updateUser(userId: string, updates: Partial<User>): User | null {
    if (!this.db.users) return null;
    const idx = this.db.users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;

    const existing = this.db.users[idx];
    // Palavras-passe são tratadas à parte pelo Supabase Auth
    // (see resetUserPassword) — never write a password onto the profile.
    const { password: _ignoredPassword, ...safeUpdates } = updates as any;
    // `access` nunca segue pelo caminho normal: vai para o nó protegido (só admin).
    if ('access' in safeUpdates) {
      const newAccess = safeUpdates.access as UserAccess | undefined;
      delete safeUpdates.access;
      if (this.db.currentUser?.role === 'admin') {
        this.saveUserAccess(userId, newAccess || null).catch(() => {});
      }
    }
    const updated: User = {
      ...existing,
      ...safeUpdates,
      id: existing.id
    };

    this.db.users[idx] = updated;

    if (this.db.currentUser && this.db.currentUser.id === userId) {
      this.db.currentUser = updated;
    }

    // Sincroniza os dados de apresentação do perfil
    this.saveUserToCloud(updated).catch(() => {});

    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action: 'Atualização de Utilizador',
      details: `Dados do utilizador "${updated.name}" atualizados.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#1d4ed8'
    });

    this.notify();
    return updated;
  }

  public deleteUser(userId: string): { success: boolean; error?: string } {
    if (!this.db.users) return { success: false, error: 'Lista de utilizadores vazia.' };

    const target = this.db.users.find((u) => u.id === userId);
    if (!target) return { success: false, error: 'Utilizador não encontrado.' };

    if (target.role === 'admin') {
      const adminCount = this.db.users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        return {
          success: false,
          error: 'Não é possível eliminar o único Administrador Geral da instituição.'
        };
      }
    }

    if (this.db.currentUser && this.db.currentUser.id === userId) {
      return {
        success: false,
        error: 'Não pode eliminar a sua própria conta ativa em sessão.'
      };
    }

    this.db.users = this.db.users.filter((u) => u.id !== userId);

    // Elimina de verdade a conta (Auth + perfil + acessos) no servidor. Se falhar, repõe a lista.
    if (target.id) {
      if (this.db.currentUser?.role === 'admin') delete this.accessMap[target.id];
      cloud.deleteAccountViaServer(target.id).then(async (r) => {
        if (r.success) return;
        console.warn('Não foi possível eliminar a conta no servidor:', r.error);
        try {
          const users = await cloud.listInstitutionUsers(this.activeInstitutionId);
          if (users.length) { this.db.users = users as User[]; this.applyAccessOverlay(); this.notifyLocal(); }
        } catch { /* sem rede */ }
      }).catch(() => {});
    }

    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action: 'Eliminação de Utilizador',
      details: `Utilizador "${target.name}" (${target.roleTitle}) eliminado da base de dados.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#ac332b'
    });

    this.notify();
    return { success: true };
  }

  private restoreInFlight: { uid: string; promise: Promise<User | null> } | null = null;

  /**
   * Chamado no arranque (e após cada login) com o que o Supabase Auth diz sobre este navegador.
   * É o ÚNICO sítio onde a validade da sessão é decidida: uma sessão guardada em localStorage
   * sem sessão Supabase correspondente nunca é considerada válida. O perfil (escola, papel) vem
   * sempre da tabela `profiles`, protegida por RLS.
   */
  public async restoreSession(uid: string | null): Promise<User | null> {
    if (!uid) {
      this.db.currentUser = null;
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('bandmed_session_user');
        } catch (e) {
          console.warn(e);
        }
      }
      this.notifyLocal();
      return null;
    }
    if (this.restoreInFlight && this.restoreInFlight.uid === uid) return this.restoreInFlight.promise;
    const promise = this.doRestoreSession(uid).finally(() => {
      if (this.restoreInFlight?.promise === promise) this.restoreInFlight = null;
    });
    this.restoreInFlight = { uid, promise };
    return promise;
  }

  private async doRestoreSession(uid: string): Promise<User | null> {
    // Existe sessão e o perfil em cache é o mesmo: confia e evita uma viagem à rede.
    if (this.db.currentUser && this.db.currentUser.id === uid) {
      this.sessionVerified = true;
      void this.initRemoteSync();
      return this.db.currentUser;
    }

    let profile: User | null = null;
    try {
      profile = (await cloud.loadProfileById(uid)) as User | null;
    } catch (e) {
      console.warn('Erro ao restaurar perfil da sessão:', e);
    }

    if (!profile) {
      // Autenticado mas sem perfil activo na escola: não entra na aplicação.
      this.db.currentUser = null;
      return null;
    }

    if (profile.institutionId && profile.institutionId !== this.activeInstitutionId) {
      await this.switchInstitution(profile.institutionId, { sync: false });
    }

    if (!(this.db.users || []).some((u) => u.id === profile!.id)) {
      this.db.users = [profile, ...(this.db.users || [])];
    }

    const existingLocal = this.db.users?.find((u) => u.id === profile!.id);
    const existingAccess = this.accessMap[profile!.id] || existingLocal?.access || (profile as any)?.access;
    profile = { ...profile, access: existingAccess || undefined } as User;
    this.db.currentUser = profile;
    this.sessionVerified = true;
    await this.startAccessSync();
    // Lê o documento da escola, liga o tempo real e carrega as colecções por registo (initShards).
    await this.initRemoteSync();
    profile = (this.db.currentUser as User) || profile;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('bandmed_session_user', JSON.stringify(profile));
        localStorage.setItem('escola_active_institution_id', this.activeInstitutionId);
      } catch (e) {
        console.warn(e);
      }
    }

    this.notify();
    return profile;
  }

  // Auth & Session
  public getCurrentUser(): User | null {
    return this.db.currentUser || null;
  }

  public setCurrentUser(user: User) {
    this.db.currentUser = user;
    this.notify();
  }

  /** Termina a sessão Supabase e limpa o espelho local. */
  public async logout() {
    try {
      await signOutSupabase();
    } catch (e) {
      console.warn(e);
    }
    clearActivity();
    this.stopAccessSync();
    this.detachShards();
    if (this.unsubscribeRealtime) {
      this.unsubscribeRealtime();
      this.unsubscribeRealtime = null;
    }
    this.sessionVerified = false;
    this.db.currentUser = null;
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.removeItem('bandmed_session_user');
      }
    } catch (e) {
      console.warn(e);
    }
    this.notify();
  }

  /**
   * Converte o que a pessoa escreveu no login (e-mail, nome de utilizador, nº de processo/agente) no e-mail da conta.
   * Antes de entrar a base de dados não revela quem tem conta (por segurança), por isso nome de utilizador e nº de
   * processo só funcionam em dispositivos onde a lista de utilizadores da escola já foi carregada.
   */
  public resolveLoginEmail(identifier: string): string | null {
    const term = identifier.trim().toLowerCase();
    if (!term) return null;
    if (term.includes('@')) return term;
    const local = (this.db.users || []).find(
      (u) =>
        (u.username && u.username.toLowerCase() === term) ||
        (u.processNumber && u.processNumber.toLowerCase() === term)
    );
    return local?.email ? local.email.toLowerCase() : null;
  }


  // Dynamic synchronization of enrolled students count in classes
  public syncClassStudentCounts() {
    if (!this.db.classes) return;
    this.db.classes = this.db.classes.map((cls) => {
      const realEnrolled = (this.db.students || []).filter(
        (s) => String(s.classId) === String(cls.id)
      ).length;
      return {
        ...cls,
        studentCount: realEnrolled > 0 ? realEnrolled : (cls.studentCount || 0)
      };
    });
  }

  // ================= MATRÍCULAS =================
  // A ficha do Aluno (Student) guarda só dados pessoais/documentais. A
  // Matrícula (1 aluno → N matrículas, uma por ano letivo em que estudou
  // nesta instituição) é que define turma, regime e plano financeiro, e é
  // ela que gera as obrigações financeiras (taxa de matrícula + mensalidades)
  // em `db.invoices` — nunca a ficha de cadastro do aluno.

  public getMatriculasByStudent(studentId: string): Matricula[] {
    return (this.db.matriculas || [])
      .filter((m) => m.studentId === studentId)
      .sort((a, b) => b.academicYear.localeCompare(a.academicYear));
  }

  /** Histórico escolar DENTRO da instituição (anos em que o aluno estudou aqui). */
  public getHistoricoEscolar(studentId: string): Matricula[] {
    return this.getMatriculasByStudent(studentId);
  }

  /** Nº de matrícula sequencial real, nunca repetido: MAT-<ano letivo>-<seq 4 dígitos>. */
  public generateMatriculaNumber(academicYear?: string): string {
    const yearPart = (academicYear || this.db.settings?.currentAcademicYear || String(new Date().getFullYear())).replace('/', '-');
    let max = 0;
    for (const m of this.db.matriculas || []) {
      const match = (m.numeroMatricula || '').match(/MAT-.*-(\d+)$/);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return `MAT-${yearPart}-${String(max + 1).padStart(4, '0')}`;
  }

  /**
   * Confirma uma Matrícula: grava o registo histórico, atualiza o "instantâneo"
   * de turma/plano financeiro do Aluno (que Turmas/Assiduidade/Pautas/Propinas
   * já consomem via `Student`) e GERA AS OBRIGAÇÕES FINANCEIRAS — 1 fatura da
   * taxa de matrícula + N faturas de propina (mensalidades). Nunca inventa
   * valores: tudo vem dos dados da própria Matrícula, que por sua vez vêm da
   * Tabela Financeira real (`settings.tuitionRows`) e das Regras Financeiras
   * (`settings.financialRules`) configuradas pela instituição.
   */
  public confirmMatricula(
    data: Omit<Matricula, 'id' | 'numeroMatricula' | 'generatedInvoiceIds' | 'createdAt' | 'studentName' | 'studentProcNumber' | 'studentAvatar' | 'studentGender' | 'studentBirthDate'>
  ): Matricula {
    const student = this.db.students.find((s) => s.id === data.studentId);
    if (!student) throw new Error('Aluno não encontrado. Cadastre o aluno antes de matricular.');

    const matricula: Matricula = {
      ...data,
      id: `mat-${Date.now()}`,
      numeroMatricula: this.generateMatriculaNumber(data.academicYear),
      studentName: student.name,
      studentProcNumber: student.procNumber,
      studentAvatar: student.avatar,
      studentGender: student.gender,
      studentBirthDate: student.birthDate,
      createdAt: new Date().toISOString()
    };

    // 1) Guardar o registo histórico da matrícula
    this.db.matriculas = [matricula, ...(this.db.matriculas || [])];

    // 2) Aluno passa a refletir a turma/plano financeiro desta matrícula
    //    (estado "atual" consumido por Turmas/Assiduidade/Pautas/Propinas)
    const exempt = matricula.tipoAluno === 'isento' || matricula.tipoAluno === 'bolseiro';
    this.updateStudent(student.id, {
      classId: matricula.classId,
      className: matricula.className,
      grade: matricula.grade,
      shift: matricula.shift,
      courseName: matricula.courseName,
      monthlyTuitionKz: matricula.valorPropinaKz,
      financialStatus: exempt ? 'isento' : matricula.estadoFinanceiro,
      status: 'active',
      studentSituation: 'Activo'
    } as Partial<Student>);
    this.syncClassStudentCounts();

    // 3) GERAR PAGAMENTOS — Matrícula ⇒ obrigação financeira única;
    //    Propina ⇒ N mensalidades (nunca geradas para alunos isentos/bolseiros)
    const invoiceIds: string[] = [];
    const baseInvoice = {
      studentId: student.id,
      studentName: student.name,
      procNumber: student.procNumber,
      avatar: student.avatar,
      className: matricula.className,
      guardianName: matricula.responsavelFinanceiroNome || student.guardianName || '',
      guardianNif: student.guardianNif || '',
      guardianPhone: matricula.responsavelFinanceiroTelefone || student.guardianPhone || '',
      guardianAddress: student.residence?.province
        ? student.residence.province + (student.residence.neighborhood ? ', ' + student.residence.neighborhood : '')
        : student.address || '',
      studentBiNumber: student.biNumber || '',
      status: 'pendente' as const,
      lateFeeKz: 0
    };

    if (!exempt && matricula.valorMatriculaKz > 0) {
      const dueDay = Math.min(matricula.diaVencimento || this.db.settings?.financialRules?.paymentDueDay || 10, 28);
      const due = new Date();
      due.setDate(dueDay);
      const inv = this.createInvoice({
        ...baseInvoice,
        period: matricula.academicYear,
        description: `Taxa de Matrícula — ${matricula.grade} (${matricula.academicYear})`,
        baseAmountKz: matricula.valorMatriculaKz,
        totalAmountKz: matricula.valorMatriculaKz,
        dueDate: due.toISOString().slice(0, 10)
      });
      invoiceIds.push(inv.id);
    }

    const installments = matricula.numeroParcelas || 0;
    if (!exempt && matricula.valorPropinaKz > 0 && installments > 0) {
      const net = Math.round(matricula.valorPropinaKz * (1 - (matricula.descontoPercent || 0) / 100));
      const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const startIso = this.db.settings?.academicPeriodStartIso;
      let cursor = startIso ? new Date(startIso + 'T00:00:00') : new Date(`${matricula.academicYear.split('/')[0]}-09-01T00:00:00`);
      for (let i = 0; i < installments; i++) {
        const dueDay = Math.min(matricula.diaVencimento || this.db.settings?.financialRules?.paymentDueDay || 10, 28);
        const due = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay);
        const inv = this.createInvoice({
          ...baseInvoice,
          period: `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`,
          description: `Propina — ${monthNames[cursor.getMonth()]} ${cursor.getFullYear()} — ${matricula.grade} ${matricula.className}`,
          baseAmountKz: net,
          totalAmountKz: net,
          dueDate: due.toISOString().slice(0, 10)
        });
        invoiceIds.push(inv.id);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    }

    matricula.generatedInvoiceIds = invoiceIds;
    this.db.matriculas = (this.db.matriculas || []).map((m) => (m.id === matricula.id ? matricula : m));
    this.notify();
    return matricula;
  }

  public updateMatricula(id: string, updates: Partial<Matricula>) {
    this.db.matriculas = (this.db.matriculas || []).map((m) => (m.id === id ? { ...m, ...updates } : m));
    this.notify();
  }

  // Students CRUD
  public addStudent(
    student: Omit<Student, 'id' | 'procNumber' | 'attendanceRate' | 'currentAverage'> & {
      procNumber?: string;
    }
  ): Student {
    const photo = student.docPassPhoto || student.avatar || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150';
    const newStudent: Student = {
      ...student,
      id: `stu-${Date.now()}`,
      // Número de processo automático e aleatório: <ano lectivo inicial>-<4 a 6 dígitos>
      // (ex.: 2026-81457), nunca repetido face aos já atribuídos.
      procNumber:
        student.procNumber ||
        generateStudentProcNumber(
          (this.db.students || []).map((s) => s.procNumber),
          this.db.settings?.currentAcademicYear
        ),
      avatar: photo,
      docPassPhoto: photo,
      // Sem dados inventados: um aluno acabado de matricular ainda não tem
      // assiduidade medida nem média, e não tem nenhuma nota lançada.
      attendanceRate: 100,
      currentAverage: 0,
      unexcusedAbsences: 0,
      excusedAbsences: 0,
      isTuitionPaidCurrentMonth: student.financialStatus !== 'debito',
      disciplineGrades: student.disciplineGrades || []
    };
    this.db.students = [newStudent, ...this.db.students];
    this.syncClassStudentCounts();
    this.notify();
    return newStudent;
  }

  public updateStudent(id: string, updates: Partial<Student>) {
    this.db.students = this.db.students.map((s) => {
      if (s.id !== id) return s;
      const updated = { ...s, ...updates };
      if (updates.docPassPhoto && !updates.avatar) {
        updated.avatar = updates.docPassPhoto;
      } else if (updates.avatar && !updates.docPassPhoto) {
        updated.docPassPhoto = updates.avatar;
      }
      return updated;
    });
    this.syncClassStudentCounts();
    this.notify();
  }

  public deleteStudent(id: string) {
    this.db.students = this.db.students.filter((s) => s.id !== id);
    this.syncClassStudentCounts();
    this.notify();
  }

  // Teachers CRUD
  public addTeacher(
    teacher: Omit<Teacher, 'id' | 'agentNumber' | 'rating' | 'evaluationsCount'> & {
      agentNumber?: string;
    }
  ): Teacher {
    const newTeacher: Teacher = {
      ...teacher,
      id: `prof-${Date.now()}`,
      // Número de agente automático e aleatório: AG-<4 dígitos> (ex.: AG-0044),
      // nunca repetido face aos já atribuídos.
      agentNumber:
        teacher.agentNumber ||
        generateTeacherAgentNumber((this.db.teachers || []).map((t) => t.agentNumber)),
      // No fabricated rating: a real teacher has no evaluations until the
      // institution actually records one.
      rating: 0,
      evaluationsCount: 0,
      allocatedClasses: teacher.allocatedClasses || []
    };
    this.db.teachers = [newTeacher, ...this.db.teachers];
    this.notify();
    return newTeacher;
  }

  public updateTeacher(id: string, updates: Partial<Teacher>) {
    this.db.teachers = this.db.teachers.map((t) => (t.id === id ? { ...t, ...updates } : t));
    // If teacher's name was changed, sync to classes where this teacher is assigned as Director
    if (updates.name && this.db.classes) {
      this.db.classes = this.db.classes.map((c) =>
        c.headTeacherId === id ? { ...c, headTeacherName: updates.name! } : c
      );
    }
    this.notify();
  }

  public deleteTeacher(id: string): { success: boolean; unlinkedClassesCount: number } {
    let unlinkedCount = 0;
    if (this.db.classes) {
      this.db.classes = this.db.classes.map((c) => {
        if (c.headTeacherId === id) {
          unlinkedCount++;
          return { ...c, headTeacherId: '', headTeacherName: 'A designar' };
        }
        return c;
      });
    }
    this.db.teachers = this.db.teachers.filter((t) => t.id !== id);
    this.notify();
    return { success: true, unlinkedClassesCount: unlinkedCount };
  }

  // Funcionários CRUD (pessoal não-docente: secretaria, direção, tesouraria, apoio, etc.)
  public getFuncionarios(): Funcionario[] {
    return this.db.funcionarios || [];
  }

  public addFuncionario(
    funcionario: Omit<Funcionario, 'id' | 'employeeNumber'> & { employeeNumber?: string }
  ): Funcionario {
    const newFuncionario: Funcionario = {
      ...funcionario,
      id: `func-${Date.now()}`,
      employeeNumber:
        funcionario.employeeNumber ||
        generateFuncionarioNumber((this.db.funcionarios || []).map((f) => f.employeeNumber))
    };
    this.db.funcionarios = [newFuncionario, ...(this.db.funcionarios || [])];
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action: 'Cadastro de Funcionário',
      details: `Novo funcionário "${newFuncionario.name}" registado na base de dados institucional.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return newFuncionario;
  }

  public updateFuncionario(id: string, updates: Partial<Funcionario>) {
    this.db.funcionarios = (this.db.funcionarios || []).map((f) => (f.id === id ? { ...f, ...updates } : f));
    this.notify();
  }

  public deleteFuncionario(id: string): { success: boolean } {
    this.db.funcionarios = (this.db.funcionarios || []).filter((f) => f.id !== id);
    this.notify();
    return { success: true };
  }

  public clearFuncionarios() {
    this.db.funcionarios = [];
    this.notify();
  }

  // ------------------------------------------------------------------
  // Departamentos (Cadastro → Departamentos)
  //  • curricular   → usados no seletor de Departamento dos Professores
  //  • profissional → usados no seletor de Departamento dos Funcionários
  // O departamento é guardado por NOME nos registos de professores e
  // funcionários; por isso renomear cascateia e eliminar é bloqueado
  // enquanto houver pessoas associadas.
  // ------------------------------------------------------------------
  public getDepartments(kind?: DepartmentKind): SchoolDepartment[] {
    const all = this.db.departments || [];
    return kind ? all.filter((d) => d.kind === kind) : all;
  }

  /** Nº de professores (curricular) ou funcionários (profissional) num departamento. */
  public countDepartmentMembers(kind: DepartmentKind, name: string): number {
    const target = name.trim().toLowerCase();
    const people: Array<{ department?: string }> =
      kind === 'curricular' ? this.db.teachers || [] : this.db.funcionarios || [];
    return people.filter((p) => (p.department || '').trim().toLowerCase() === target).length;
  }

  public addDepartment(
    department: Omit<SchoolDepartment, 'id' | 'createdAt'>
  ): { success: boolean; error?: string; department?: SchoolDepartment } {
    const name = department.name.trim();
    if (!name) return { success: false, error: 'Indique o nome do departamento.' };
    const duplicate = (this.db.departments || []).some(
      (d) => d.kind === department.kind && d.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Já existe um departamento "${name}" nesta categoria.` };
    }
    const created: SchoolDepartment = {
      ...department,
      name,
      id: `dept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    this.db.departments = [...(this.db.departments || []), created];
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action: 'Cadastro de Departamento',
      details: `Departamento ${created.kind === 'curricular' ? 'curricular' : 'profissional'} "${created.name}" registado.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true, department: created };
  }

  public updateDepartment(
    id: string,
    updates: Partial<Omit<SchoolDepartment, 'id' | 'createdAt'>>
  ): { success: boolean; error?: string } {
    const current = (this.db.departments || []).find((d) => d.id === id);
    if (!current) return { success: false, error: 'Departamento não encontrado.' };

    const nextKind = updates.kind ?? current.kind;
    const nextName = (updates.name ?? current.name).trim();
    if (!nextName) return { success: false, error: 'Indique o nome do departamento.' };

    const duplicate = (this.db.departments || []).some(
      (d) => d.id !== id && d.kind === nextKind && d.name.trim().toLowerCase() === nextName.toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Já existe um departamento "${nextName}" nesta categoria.` };
    }

    // A categoria não pode mudar se houver pessoas associadas (ficariam órfãs).
    if (nextKind !== current.kind && this.countDepartmentMembers(current.kind, current.name) > 0) {
      return {
        success: false,
        error: 'Não é possível mudar a categoria: existem professores/funcionários associados a este departamento.'
      };
    }

    this.db.departments = (this.db.departments || []).map((d) =>
      d.id === id ? { ...d, ...updates, name: nextName, kind: nextKind } : d
    );

    // Renomeação cascateia para os registos que usam o nome antigo.
    if (nextName !== current.name) {
      if (current.kind === 'curricular') {
        this.db.teachers = (this.db.teachers || []).map((t) =>
          (t.department || '').trim().toLowerCase() === current.name.trim().toLowerCase()
            ? { ...t, department: nextName }
            : t
        );
      } else {
        this.db.funcionarios = (this.db.funcionarios || []).map((f) =>
          (f.department || '').trim().toLowerCase() === current.name.trim().toLowerCase()
            ? { ...f, department: nextName }
            : f
        );
      }
    }
    this.notify();
    return { success: true };
  }

  public deleteDepartment(
    id: string
  ): { success: boolean; error?: string; membersCount?: number } {
    const current = (this.db.departments || []).find((d) => d.id === id);
    if (!current) return { success: false, error: 'Departamento não encontrado.' };
    const membersCount = this.countDepartmentMembers(current.kind, current.name);
    if (membersCount > 0) {
      return {
        success: false,
        membersCount,
        error: `Não é possível eliminar: ${membersCount} ${
          current.kind === 'curricular'
            ? membersCount === 1 ? 'professor está associado' : 'professores estão associados'
            : membersCount === 1 ? 'funcionário está associado' : 'funcionários estão associados'
        } a "${current.name}". Reatribua-os a outro departamento primeiro ou marque este como Inativo.`
      };
    }
    this.db.departments = (this.db.departments || []).filter((d) => d.id !== id);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Atribuição de Disciplinas por Classe/Curso (Secretaria Académica →
  // Atribuição): define quais disciplinas uma Classe (e, a partir da 10.ª
  // classe, também o Curso) vai ter, e qual o Professor responsável por cada
  // uma. Aplica-se a TODAS as turmas dessa Classe/Curso no Ano Letivo — ver
  // `utils/classSubjects.ts`, consumido pela Pauta Geral.
  // ------------------------------------------------------------------
  public getSubjectAssignments(filter?: {
    academicYear?: string;
    grade?: string;
    courseName?: string | null;
  }): SubjectClassAssignment[] {
    const all = this.db.subjectAssignments || [];
    if (!filter) return all;
    return all.filter((a) => {
      if (filter.academicYear && a.academicYear !== filter.academicYear) return false;
      if (filter.grade && a.grade !== filter.grade) return false;
      if (filter.courseName !== undefined) {
        const target = (filter.courseName || '').trim().toLowerCase();
        const current = (a.courseName || '').trim().toLowerCase();
        if (target !== current) return false;
      }
      return true;
    });
  }

  public addSubjectAssignment(
    assignment: Omit<SubjectClassAssignment, 'id' | 'createdAt'>
  ): { success: boolean; error?: string; assignment?: SubjectClassAssignment } {
    if (!assignment.grade) return { success: false, error: 'Indique a Classe.' };
    if (!assignment.subjectId || !assignment.subjectName) {
      return { success: false, error: 'Selecione a disciplina.' };
    }
    if (!assignment.teacherId || !assignment.teacherName) {
      return { success: false, error: 'Selecione o professor responsável pela disciplina.' };
    }

    const courseKey = (assignment.courseName || '').trim().toLowerCase();
    const duplicate = (this.db.subjectAssignments || []).some(
      (a) =>
        a.academicYear === assignment.academicYear &&
        a.grade === assignment.grade &&
        (a.courseName || '').trim().toLowerCase() === courseKey &&
        a.subjectId === assignment.subjectId
    );
    if (duplicate) {
      return {
        success: false,
        error: `A disciplina "${assignment.subjectName}" já está atribuída a esta ${assignment.courseName ? `Classe/Curso` : 'Classe'}.`
      };
    }

    const created: SubjectClassAssignment = {
      ...assignment,
      id: `subatr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    this.db.subjectAssignments = [...(this.db.subjectAssignments || []), created];
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action: 'Atribuição de Disciplina',
      details: `Disciplina "${created.subjectName}" atribuída à ${created.grade}${created.courseName ? ` (${created.courseName})` : ''}, sob responsabilidade do(a) docente ${created.teacherName}.`,
      module: 'turmas',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true, assignment: created };
  }

  public updateSubjectAssignment(
    id: string,
    updates: Partial<Omit<SubjectClassAssignment, 'id' | 'createdAt'>>
  ): { success: boolean; error?: string } {
    const current = (this.db.subjectAssignments || []).find((a) => a.id === id);
    if (!current) return { success: false, error: 'Atribuição não encontrada.' };

    this.db.subjectAssignments = (this.db.subjectAssignments || []).map((a) =>
      a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
    );
    this.notify();
    return { success: true };
  }

  public deleteSubjectAssignment(id: string): { success: boolean; error?: string } {
    const current = (this.db.subjectAssignments || []).find((a) => a.id === id);
    if (!current) return { success: false, error: 'Atribuição não encontrada.' };
    this.db.subjectAssignments = (this.db.subjectAssignments || []).filter((a) => a.id !== id);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Fornecedores da instituição (Logística → Fornecedores)
  // ------------------------------------------------------------------
  public getSuppliers(): Supplier[] {
    return this.db.suppliers || [];
  }

  public addSupplier(
    supplier: Omit<Supplier, 'id' | 'code' | 'createdAt'>
  ): { success: boolean; error?: string; supplier?: Supplier } {
    const name = supplier.name.trim();
    if (!name) return { success: false, error: 'Indique o nome do fornecedor.' };
    const nif = (supplier.nif || '').trim();
    if (nif && (this.db.suppliers || []).some((s) => (s.nif || '').trim() === nif)) {
      return { success: false, error: `Já existe um fornecedor registado com o NIF ${nif}.` };
    }
    const created: Supplier = {
      ...supplier,
      name,
      nif: nif || undefined,
      id: `forn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateSupplierCode((this.db.suppliers || []).map((s) => s.code)),
      createdAt: new Date().toISOString()
    };
    this.db.suppliers = [created, ...(this.db.suppliers || [])];
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action: 'Cadastro de Fornecedor',
      details: `Novo fornecedor "${created.name}" (${created.code}) registado.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true, supplier: created };
  }

  public updateSupplier(
    id: string,
    updates: Partial<Omit<Supplier, 'id' | 'code' | 'createdAt'>>
  ): { success: boolean; error?: string } {
    const current = (this.db.suppliers || []).find((s) => s.id === id);
    if (!current) return { success: false, error: 'Fornecedor não encontrado.' };
    const nextName = (updates.name ?? current.name).trim();
    if (!nextName) return { success: false, error: 'Indique o nome do fornecedor.' };
    const nextNif = (updates.nif ?? current.nif ?? '').trim();
    if (nextNif && (this.db.suppliers || []).some((s) => s.id !== id && (s.nif || '').trim() === nextNif)) {
      return { success: false, error: `Já existe um fornecedor registado com o NIF ${nextNif}.` };
    }
    this.db.suppliers = (this.db.suppliers || []).map((s) =>
      s.id === id ? { ...s, ...updates, name: nextName, nif: nextNif || undefined } : s
    );
    this.notify();
    return { success: true };
  }

  public deleteSupplier(id: string): { success: boolean } {
    this.db.suppliers = (this.db.suppliers || []).filter((s) => s.id !== id);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Logística 2 — Inventário de Ativos
  // ------------------------------------------------------------------
  private logisticsAudit(action: string, details: string) {
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: 'Administrador',
      action,
      details,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
  }

  private newLogisticsId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  public getAssets(): Asset[] {
    return this.db.assets || [];
  }

  private validateAsset(
    fields: Partial<Omit<Asset, 'id' | 'code' | 'createdAt'>>,
    ignoreId?: string
  ): string | null {
    if (!(fields.name || '').trim()) return 'Indique o nome do ativo.';
    if (fields.category === 'outro' && !(fields.categoryOtherDescricao || '').trim()) {
      return 'Descreva a categoria quando selecionar "Outro".';
    }
    if (fields.acquisitionValueKz !== undefined && (!Number.isFinite(fields.acquisitionValueKz) || fields.acquisitionValueKz < 0)) {
      return 'O valor de aquisição não pode ser negativo.';
    }
    const serial = (fields.serialNumber || '').trim().toLowerCase();
    if (serial && (this.db.assets || []).some((a) => a.id !== ignoreId && (a.serialNumber || '').trim().toLowerCase() === serial)) {
      return `Já existe um ativo registado com o número de série ${fields.serialNumber!.trim()}.`;
    }
    return null;
  }

  public addAsset(
    asset: Omit<Asset, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'supplierName'>
  ): { success: boolean; error?: string; asset?: Asset } {
    const error = this.validateAsset(asset);
    if (error) return { success: false, error };
    const supplier = asset.supplierId ? (this.db.suppliers || []).find((s) => s.id === asset.supplierId) : undefined;
    const created: Asset = {
      ...asset,
      name: asset.name.trim(),
      categoryOtherDescricao: asset.category === 'outro' ? asset.categoryOtherDescricao?.trim() : undefined,
      serialNumber: asset.serialNumber?.trim() || undefined,
      supplierName: supplier?.name,
      id: this.newLogisticsId('ativo'),
      code: generateAssetCode((this.db.assets || []).map((a) => a.code)),
      createdAt: new Date().toISOString()
    };
    this.db.assets = [created, ...(this.db.assets || [])];
    this.logisticsAudit('Cadastro de Ativo', `Novo ativo "${created.name}" (${created.code}) registado.`);
    this.notify();
    return { success: true, asset: created };
  }

  public updateAsset(
    id: string,
    updates: Partial<Omit<Asset, 'id' | 'code' | 'createdAt' | 'supplierName'>>
  ): { success: boolean; error?: string } {
    const current = (this.db.assets || []).find((a) => a.id === id);
    if (!current) return { success: false, error: 'Ativo não encontrado.' };
    const merged = { ...current, ...updates };
    const error = this.validateAsset(merged, id);
    if (error) return { success: false, error };
    const supplier = merged.supplierId ? (this.db.suppliers || []).find((s) => s.id === merged.supplierId) : undefined;
    this.db.assets = (this.db.assets || []).map((a) =>
      a.id === id
        ? {
            ...merged,
            name: merged.name.trim(),
            categoryOtherDescricao: merged.category === 'outro' ? merged.categoryOtherDescricao?.trim() : undefined,
            serialNumber: merged.serialNumber?.trim() || undefined,
            supplierName: supplier?.name ?? (merged.supplierId ? current.supplierName : undefined),
            updatedAt: new Date().toISOString()
          }
        : a
    );
    this.notify();
    return { success: true };
  }

  public deleteAsset(id: string): { success: boolean } {
    const target = (this.db.assets || []).find((a) => a.id === id);
    this.db.assets = (this.db.assets || []).filter((a) => a.id !== id);
    if (target) this.logisticsAudit('Eliminação de Ativo', `Ativo "${target.name}" (${target.code}) eliminado do inventário.`);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Logística 3 — Controlo de Estoque
  // ------------------------------------------------------------------
  public getStockItems(): StockItem[] {
    return this.db.stockItems || [];
  }

  public getStockMovements(): StockMovement[] {
    return this.db.stockMovements || [];
  }

  private validateStockItem(fields: Partial<StockItem>): string | null {
    if (!(fields.name || '').trim()) return 'Indique o nome do item.';
    if (fields.unit === 'outro' && !(fields.unitOtherDescricao || '').trim()) {
      return 'Descreva a unidade de medida quando selecionar "Outro".';
    }
    if (!Number.isFinite(fields.currentQuantity) || (fields.currentQuantity as number) < 0) {
      return 'A quantidade em estoque não pode ser negativa.';
    }
    if (!Number.isFinite(fields.minQuantity) || (fields.minQuantity as number) < 0) {
      return 'O estoque mínimo não pode ser negativo.';
    }
    return null;
  }

  public addStockItem(
    item: Omit<StockItem, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'supplierName'>
  ): { success: boolean; error?: string; item?: StockItem } {
    const error = this.validateStockItem(item);
    if (error) return { success: false, error };
    const name = item.name.trim();
    if ((this.db.stockItems || []).some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
      return { success: false, error: `Já existe um item de estoque chamado "${name}".` };
    }
    const supplier = item.supplierId ? (this.db.suppliers || []).find((s) => s.id === item.supplierId) : undefined;
    const now = new Date().toISOString();
    const created: StockItem = {
      ...item,
      name,
      unitOtherDescricao: item.unit === 'outro' ? item.unitOtherDescricao?.trim() : undefined,
      supplierName: supplier?.name,
      id: this.newLogisticsId('stk'),
      code: generateStockItemCode((this.db.stockItems || []).map((s) => s.code)),
      createdAt: now
    };
    this.db.stockItems = [created, ...(this.db.stockItems || [])];
    // Estoque inicial fica registado como primeira entrada, para o histórico bater com o saldo.
    if (created.currentQuantity > 0) {
      const movement: StockMovement = {
        id: this.newLogisticsId('mov'),
        itemId: created.id,
        itemName: created.name,
        type: 'entrada',
        quantity: created.currentQuantity,
        date: now.slice(0, 10),
        reason: 'Estoque inicial',
        performedByName: this.currentActorName(),
        createdAt: now
      };
      this.db.stockMovements = [movement, ...(this.db.stockMovements || [])];
    }
    this.logisticsAudit('Cadastro de Item de Estoque', `Novo item "${created.name}" (${created.code}) registado.`);
    this.notify();
    return { success: true, item: created };
  }

  /** Atualiza os dados do item. A quantidade só muda através de movimentos. */
  public updateStockItem(
    id: string,
    updates: Partial<Omit<StockItem, 'id' | 'code' | 'createdAt' | 'currentQuantity' | 'supplierName'>>
  ): { success: boolean; error?: string } {
    const current = (this.db.stockItems || []).find((s) => s.id === id);
    if (!current) return { success: false, error: 'Item não encontrado.' };
    const merged = { ...current, ...updates };
    const error = this.validateStockItem(merged);
    if (error) return { success: false, error };
    const name = merged.name.trim();
    if ((this.db.stockItems || []).some((s) => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase())) {
      return { success: false, error: `Já existe um item de estoque chamado "${name}".` };
    }
    const supplier = merged.supplierId ? (this.db.suppliers || []).find((s) => s.id === merged.supplierId) : undefined;
    this.db.stockItems = (this.db.stockItems || []).map((s) =>
      s.id === id
        ? {
            ...merged,
            name,
            unitOtherDescricao: merged.unit === 'outro' ? merged.unitOtherDescricao?.trim() : undefined,
            supplierName: supplier?.name ?? (merged.supplierId ? current.supplierName : undefined),
            updatedAt: new Date().toISOString()
          }
        : s
    );
    if (name !== current.name) {
      this.db.stockMovements = (this.db.stockMovements || []).map((m) => (m.itemId === id ? { ...m, itemName: name } : m));
    }
    this.notify();
    return { success: true };
  }

  public deleteStockItem(id: string): { success: boolean } {
    const target = (this.db.stockItems || []).find((s) => s.id === id);
    this.db.stockItems = (this.db.stockItems || []).filter((s) => s.id !== id);
    this.db.stockMovements = (this.db.stockMovements || []).filter((m) => m.itemId !== id);
    if (target) this.logisticsAudit('Eliminação de Item de Estoque', `Item "${target.name}" (${target.code}) e respetivo histórico eliminados.`);
    this.notify();
    return { success: true };
  }

  public registerStockMovement(input: {
    itemId: string;
    type: StockMovementType;
    quantity: number;
    date?: string;
    reason?: string;
    relatedDocument?: string;
  }): { success: boolean; error?: string; movement?: StockMovement } {
    const item = (this.db.stockItems || []).find((s) => s.id === input.itemId);
    if (!item) return { success: false, error: 'Item de estoque não encontrado.' };
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      return { success: false, error: 'A quantidade do movimento tem de ser maior que zero.' };
    }
    if (input.type === 'saida' && input.quantity > item.currentQuantity) {
      return {
        success: false,
        error: `Estoque insuficiente: existem apenas ${item.currentQuantity} em "${item.name}".`
      };
    }
    const nextQty = input.type === 'entrada' ? item.currentQuantity + input.quantity : item.currentQuantity - input.quantity;
    const now = new Date().toISOString();
    const movement: StockMovement = {
      id: this.newLogisticsId('mov'),
      itemId: item.id,
      itemName: item.name,
      type: input.type,
      quantity: input.quantity,
      date: input.date || now.slice(0, 10),
      reason: input.reason?.trim() || undefined,
      relatedDocument: input.relatedDocument?.trim() || undefined,
      performedByName: this.currentActorName(),
      createdAt: now
    };
    this.db.stockMovements = [movement, ...(this.db.stockMovements || [])];
    this.db.stockItems = (this.db.stockItems || []).map((s) =>
      s.id === item.id ? { ...s, currentQuantity: nextQty, updatedAt: now } : s
    );
    this.logisticsAudit(
      input.type === 'entrada' ? 'Entrada de Estoque' : 'Saída de Estoque',
      `${input.type === 'entrada' ? 'Entrada' : 'Saída'} de ${input.quantity} em "${item.name}" (${item.code}). Saldo: ${nextQty}.`
    );
    this.notify();
    return { success: true, movement };
  }

  // ------------------------------------------------------------------
  // Logística 4 — Transporte Escolar (viaturas, rotas e alunos)
  // ------------------------------------------------------------------
  public getVehicles(): SchoolVehicle[] {
    return this.db.vehicles || [];
  }

  public getTransportRoutes(): TransportRoute[] {
    return this.db.transportRoutes || [];
  }

  private normalizePlate(plate: string): string {
    return plate.trim().toUpperCase().replace(/\s+/g, '');
  }

  public addVehicle(
    vehicle: Omit<SchoolVehicle, 'id' | 'code' | 'createdAt'>
  ): { success: boolean; error?: string; vehicle?: SchoolVehicle } {
    const plate = vehicle.plate.trim().toUpperCase();
    if (!plate) return { success: false, error: 'Indique a matrícula da viatura.' };
    if (!vehicle.model.trim()) return { success: false, error: 'Indique o modelo da viatura.' };
    if (!Number.isFinite(vehicle.capacity) || vehicle.capacity < 1) {
      return { success: false, error: 'A capacidade tem de ser de pelo menos 1 lugar.' };
    }
    if ((this.db.vehicles || []).some((v) => this.normalizePlate(v.plate) === this.normalizePlate(plate))) {
      return { success: false, error: `Já existe uma viatura registada com a matrícula ${plate}.` };
    }
    const created: SchoolVehicle = {
      ...vehicle,
      plate,
      model: vehicle.model.trim(),
      id: this.newLogisticsId('veic'),
      code: generateVehicleCode((this.db.vehicles || []).map((v) => v.code)),
      createdAt: new Date().toISOString()
    };
    this.db.vehicles = [created, ...(this.db.vehicles || [])];
    this.logisticsAudit('Cadastro de Viatura', `Nova viatura ${created.plate} (${created.code}) registada.`);
    this.notify();
    return { success: true, vehicle: created };
  }

  public updateVehicle(
    id: string,
    updates: Partial<Omit<SchoolVehicle, 'id' | 'code' | 'createdAt'>>
  ): { success: boolean; error?: string } {
    const current = (this.db.vehicles || []).find((v) => v.id === id);
    if (!current) return { success: false, error: 'Viatura não encontrada.' };
    const merged = { ...current, ...updates };
    const plate = merged.plate.trim().toUpperCase();
    if (!plate) return { success: false, error: 'Indique a matrícula da viatura.' };
    if (!merged.model.trim()) return { success: false, error: 'Indique o modelo da viatura.' };
    if (!Number.isFinite(merged.capacity) || merged.capacity < 1) {
      return { success: false, error: 'A capacidade tem de ser de pelo menos 1 lugar.' };
    }
    if ((this.db.vehicles || []).some((v) => v.id !== id && this.normalizePlate(v.plate) === this.normalizePlate(plate))) {
      return { success: false, error: `Já existe uma viatura registada com a matrícula ${plate}.` };
    }
    const overloaded = (this.db.transportRoutes || []).find(
      (r) => r.vehicleId === id && routeOccupancy(r) > merged.capacity
    );
    if (overloaded) {
      return {
        success: false,
        error: `A rota "${overloaded.name}" tem ${routeOccupancy(overloaded)} passageiros, acima da nova capacidade (${merged.capacity}).`
      };
    }
    const nextVehicle: SchoolVehicle = { ...merged, plate, model: merged.model.trim() };
    this.db.vehicles = (this.db.vehicles || []).map((v) => (v.id === id ? nextVehicle : v));
    this.db.transportRoutes = (this.db.transportRoutes || []).map((r) =>
      r.vehicleId === id ? { ...r, vehicleName: `${nextVehicle.plate} · ${nextVehicle.model}` } : r
    );
    this.notify();
    return { success: true };
  }

  public deleteVehicle(id: string): { success: boolean; error?: string } {
    const inUse = (this.db.transportRoutes || []).find((r) => r.vehicleId === id);
    if (inUse) {
      return { success: false, error: `Esta viatura está atribuída à rota "${inUse.name}". Retire-a da rota antes de eliminar.` };
    }
    const target = (this.db.vehicles || []).find((v) => v.id === id);
    this.db.vehicles = (this.db.vehicles || []).filter((v) => v.id !== id);
    if (target) this.logisticsAudit('Eliminação de Viatura', `Viatura ${target.plate} (${target.code}) eliminada.`);
    this.notify();
    return { success: true };
  }

  private validateRoute(
    fields: Partial<TransportRoute>,
    ignoreId?: string
  ): { error?: string; vehicleName?: string } {
    if (!(fields.name || '').trim()) return { error: 'Indique o nome da rota.' };
    if (!(fields.stops || []).some((s) => s.name.trim())) {
      return { error: 'Adicione pelo menos uma paragem à rota.' };
    }
    if (fields.monthlyFeeKz !== undefined && (!Number.isFinite(fields.monthlyFeeKz) || fields.monthlyFeeKz < 0)) {
      return { error: 'A mensalidade não pode ser negativa.' };
    }
    let vehicleName: string | undefined;
    if (fields.vehicleId) {
      const vehicle = (this.db.vehicles || []).find((v) => v.id === fields.vehicleId);
      if (!vehicle) return { error: 'Viatura selecionada não encontrada.' };
      const occ =
        (fields.studentIds || []).length + (fields.teacherIds || []).length + (fields.funcionarioIds || []).length;
      if (occ > vehicle.capacity) {
        return { error: `A viatura ${vehicle.plate} tem capacidade para ${vehicle.capacity} passageiros.` };
      }
      vehicleName = `${vehicle.plate} · ${vehicle.model}`;
    }
    return { vehicleName };
  }

  public addTransportRoute(
    route: Omit<TransportRoute, 'id' | 'code' | 'createdAt' | 'vehicleName' | 'studentIds'>
  ): { success: boolean; error?: string; route?: TransportRoute } {
    const check = this.validateRoute({ ...route, studentIds: [] });
    if (check.error) return { success: false, error: check.error };
    const created: TransportRoute = {
      ...route,
      name: route.name.trim(),
      stops: route.stops.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), time: s.time || undefined })),
      vehicleName: check.vehicleName,
      studentIds: [],
      teacherIds: [],
      funcionarioIds: [],
      id: this.newLogisticsId('rota'),
      code: generateRouteCode((this.db.transportRoutes || []).map((r) => r.code)),
      createdAt: new Date().toISOString()
    };
    this.db.transportRoutes = [created, ...(this.db.transportRoutes || [])];
    this.logisticsAudit('Cadastro de Rota', `Nova rota "${created.name}" (${created.code}) registada.`);
    this.notify();
    return { success: true, route: created };
  }

  public updateTransportRoute(
    id: string,
    updates: Partial<Omit<TransportRoute, 'id' | 'code' | 'createdAt' | 'vehicleName' | 'studentIds'>>
  ): { success: boolean; error?: string } {
    const current = (this.db.transportRoutes || []).find((r) => r.id === id);
    if (!current) return { success: false, error: 'Rota não encontrada.' };
    const merged = { ...current, ...updates };
    const check = this.validateRoute(merged, id);
    if (check.error) return { success: false, error: check.error };
    this.db.transportRoutes = (this.db.transportRoutes || []).map((r) =>
      r.id === id
        ? {
            ...merged,
            name: merged.name.trim(),
            stops: merged.stops.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), time: s.time || undefined })),
            vehicleName: check.vehicleName
          }
        : r
    );
    this.notify();
    return { success: true };
  }

  public deleteTransportRoute(id: string): { success: boolean } {
    const target = (this.db.transportRoutes || []).find((r) => r.id === id);
    this.db.transportRoutes = (this.db.transportRoutes || []).filter((r) => r.id !== id);
    if (target) this.logisticsAudit('Eliminação de Rota', `Rota "${target.name}" (${target.code}) eliminada.`);
    this.notify();
    return { success: true };
  }

  /** Nome da pessoa (aluno, professor ou funcionário) para as mensagens de erro. */
  private transportPersonName(key: TransportPersonKey): string | null {
    const p = parsePersonKey(key);
    if (!p) return null;
    if (p.kind === 'student') return (this.db.students || []).find((s) => String(s.id) === p.id)?.name || null;
    if (p.kind === 'docente') return (this.db.teachers || []).find((t) => String(t.id) === p.id)?.name || null;
    return (this.db.funcionarios || []).find((f) => String(f.id) === p.id)?.name || null;
  }

  /**
   * Inscreve uma pessoa (aluno, professor ou funcionário) numa rota: verificação matemática
   * Lugares Ocupados < Lotação Máxima da viatura ("Lotação Esgotada"), rota activa e sem
   * duplicação noutra rota activa do mesmo turno.
   */
  public assignPersonToRoute(routeId: string, key: TransportPersonKey): { success: boolean; error?: string } {
    const route = (this.db.transportRoutes || []).find((r) => r.id === routeId);
    if (!route) return { success: false, error: 'Rota não encontrada.' };
    const parsed = parsePersonKey(key);
    if (!parsed) return { success: false, error: 'Pessoa não reconhecida.' };
    const name = this.transportPersonName(key);
    if (!name) return { success: false, error: parsed.kind === 'student' ? 'Aluno não encontrado.' : 'Pessoa não encontrada.' };
    if (routeRiderKeys(route).includes(key)) return { success: false, error: `${name} já está inscrito(a) nesta rota.` };
    if (route.status !== 'ativa') return { success: false, error: 'Não é possível inscrever numa rota inativa.' };
    if (route.vehicleId) {
      const vehicle = (this.db.vehicles || []).find((v) => v.id === route.vehicleId);
      if (vehicle && routeOccupancy(route) >= vehicle.capacity) {
        return { success: false, error: `Lotação Esgotada: a viatura ${vehicle.plate} tem ${vehicle.capacity} lugares e todos estão ocupados nesta rota/turno.` };
      }
    }
    const clash = (this.db.transportRoutes || []).find(
      (r) => r.id !== routeId && r.status === 'ativa' && routeRiderKeys(r).includes(key) && shiftsClash(r.shift, route.shift)
    );
    if (clash) {
      return { success: false, error: `${name} já está inscrito(a) na rota "${clash.name}" no mesmo turno.` };
    }
    this.db.transportRoutes = (this.db.transportRoutes || []).map((r) => {
      if (r.id !== routeId) return r;
      if (parsed.kind === 'student') return { ...r, studentIds: [...r.studentIds, parsed.id] };
      if (parsed.kind === 'docente') return { ...r, teacherIds: [...(r.teacherIds || []), parsed.id] };
      return { ...r, funcionarioIds: [...(r.funcionarioIds || []), parsed.id] };
    });
    this.notify();
    return { success: true };
  }

  public removePersonFromRoute(routeId: string, key: TransportPersonKey): { success: boolean; error?: string } {
    const route = (this.db.transportRoutes || []).find((r) => r.id === routeId);
    if (!route) return { success: false, error: 'Rota não encontrada.' };
    const parsed = parsePersonKey(key);
    if (!parsed) return { success: false, error: 'Pessoa não reconhecida.' };
    this.db.transportRoutes = (this.db.transportRoutes || []).map((r) => {
      if (r.id !== routeId) return r;
      if (parsed.kind === 'student') return { ...r, studentIds: r.studentIds.filter((id) => String(id) !== parsed.id) };
      if (parsed.kind === 'docente') return { ...r, teacherIds: (r.teacherIds || []).filter((id) => String(id) !== parsed.id) };
      return { ...r, funcionarioIds: (r.funcionarioIds || []).filter((id) => String(id) !== parsed.id) };
    });
    this.notify();
    return { success: true };
  }

  /** Inscreve um aluno numa rota (atalho de assignPersonToRoute, mantido para compatibilidade). */
  public assignStudentToRoute(routeId: string, studentId: string): { success: boolean; error?: string } {
    return this.assignPersonToRoute(routeId, personKey('student', studentId));
  }

  public removeStudentFromRoute(routeId: string, studentId: string): { success: boolean; error?: string } {
    return this.removePersonFromRoute(routeId, personKey('student', studentId));
  }

  /**
   * Valida a mensalidade de transporte de uma pessoa numa rota (um registo por mês/ano).
   * Só é possível para quem tem inscrição confirmada na rota.
   */
  public registerTransportPayment(
    routeId: string, key: TransportPersonKey, month: number, year?: string, amountKz?: number
  ): { success: boolean; error?: string; payment?: TransportPayment } {
    const route = (this.db.transportRoutes || []).find((r) => r.id === routeId);
    if (!route) return { success: false, error: 'Rota não encontrada.' };
    if (!routeRiderKeys(route).includes(key)) return { success: false, error: 'A pessoa não está inscrita nesta rota.' };
    if (!Number.isInteger(month) || month < 1 || month > 12) return { success: false, error: 'Mês inválido.' };
    const y = year || this.db.settings?.currentAcademicYear || '';
    if ((route.payments || []).some((p) => p.personKey === key && p.month === month && (!y || !p.year || p.year === y))) {
      return { success: false, error: 'A mensalidade deste mês já está validada.' };
    }
    const payment = makePayment(key, y, month, amountKz ?? route.monthlyFeeKz ?? this.db.settings?.transportFixedFeeKz);
    this.db.transportRoutes = (this.db.transportRoutes || []).map((r) =>
      r.id === routeId ? { ...r, payments: [...(r.payments || []), payment] } : r
    );
    const name = this.transportPersonName(key) || key;
    this.logisticsAudit('Mensalidade de Transporte', `${name}: mensalidade ${String(month).padStart(2, '0')}${y ? '/' + y : ''} validada na rota "${route.name}" (${payment.receipt}).`);
    this.notify();
    return { success: true, payment };
  }

  /** Anula a validação da mensalidade de um mês (por engano ou estorno). */
  public cancelTransportPayment(routeId: string, key: TransportPersonKey, month: number, year?: string): { success: boolean; error?: string } {
    const route = (this.db.transportRoutes || []).find((r) => r.id === routeId);
    if (!route) return { success: false, error: 'Rota não encontrada.' };
    const y = year || this.db.settings?.currentAcademicYear || '';
    const before = (route.payments || []).length;
    const payments = (route.payments || []).filter((p) => !(p.personKey === key && p.month === month && (!y || !p.year || p.year === y)));
    if (payments.length === before) return { success: false, error: 'Não há mensalidade validada neste mês.' };
    this.db.transportRoutes = (this.db.transportRoutes || []).map((r) => (r.id === routeId ? { ...r, payments } : r));
    this.notify();
    return { success: true };
  }

  /**
   * Regista um embarque (usado pelo aplicativo do motorista): repete a validação do passe
   * (inscrito na rota/turno, mensalidade paga, ainda não embarcado hoje) e só grava se aprovado.
   */
  public registerTransportBoarding(routeCode: string, key: TransportPersonKey, shift?: TripShift) {
    const result = evaluateTransportPass(this.db, { key, route: routeCode }, { route: routeCode, shift });
    if (!result.approved) return { success: false as const, result };
    const route = (this.db.transportRoutes || []).find((r) => r.code === routeCode && r.status === 'ativa');
    if (!route) return { success: false as const, result };
    this.db.transportRoutes = (this.db.transportRoutes || []).map((r) =>
      r.id === route.id ? { ...r, boardings: [...(r.boardings || []), makeBoarding(key, result.shift)] } : r
    );
    this.notify();
    return { success: true as const, result };
  }

  // ------------------------------------------------------------------
  // Saúde & Segurança — 1. Ficha Médica, 2. Incidentes Disciplinares,
  // 3. Autorizações de Recolha
  // ------------------------------------------------------------------
  private healthSafetyAudit(action: string, details: string, badgeColor = '#0b1f3a') {
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action,
      details,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor
    });
  }

  private newHealthSafetyId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ---------- 1. Ficha Médica do Aluno ----------

  public getMedicalRecords(): StudentMedicalRecord[] {
    return this.db.medicalRecords || [];
  }

  public getMedicalRecordByStudentId(studentId: string): StudentMedicalRecord | undefined {
    return (this.db.medicalRecords || []).find((r) => r.studentId === studentId);
  }

  /** Regista, na trilha de auditoria, que a ficha médica de um aluno foi consultada (dado de saúde confidencial). */
  public logMedicalRecordView(record: StudentMedicalRecord) {
    this.healthSafetyAudit(
      'Consulta de Ficha Médica',
      `Ficha médica de ${record.studentName} (${record.studentProcNumber}) consultada — dado de saúde confidencial.`
    );
  }

  public saveMedicalRecord(
    input: { id?: string } & MedicalRecordFieldsInput
  ): { success: boolean; error?: string; errors?: string[]; record?: StudentMedicalRecord } {
    const fields = normalizeMedicalRecordFields(input);
    const student = (this.db.students || []).find((s) => s.id === fields.studentId);
    const errors = validateMedicalRecord(fields, student, this.db.medicalRecords || [], input.id);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    if (input.id) {
      const current = (this.db.medicalRecords || []).find((r) => r.id === input.id);
      if (!current) return { success: false, error: 'Ficha médica não encontrada.' };
      const updated: StudentMedicalRecord = {
        ...current,
        ...fields,
        reviewedAt: now.slice(0, 10),
        updatedAt: now,
        updatedBy: this.currentActorName()
      };
      this.db.medicalRecords = (this.db.medicalRecords || []).map((r) => (r.id === input.id ? updated : r));
      this.healthSafetyAudit(
        'Atualização de Ficha Médica',
        `Ficha médica de ${updated.studentName} (${updated.studentProcNumber}) atualizada — dado de saúde confidencial.`
      );
      this.notify();
      return { success: true, record: updated };
    }

    const created: StudentMedicalRecord = {
      ...fields,
      id: this.newHealthSafetyId('fmed'),
      code: generateMedicalRecordCode((this.db.medicalRecords || []).map((r) => r.code)),
      studentName: student!.name,
      studentProcNumber: student!.procNumber,
      className: student!.className,
      occurrences: [],
      reviewedAt: now.slice(0, 10),
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.medicalRecords = [created, ...(this.db.medicalRecords || [])];
    this.healthSafetyAudit(
      'Cadastro de Ficha Médica',
      `Nova ficha médica de ${created.studentName} (${created.code}) registada — dado de saúde confidencial.`
    );
    this.notify();
    return { success: true, record: created };
  }

  public deleteMedicalRecord(id: string): { success: boolean; error?: string } {
    const target = (this.db.medicalRecords || []).find((r) => r.id === id);
    if (!target) return { success: false, error: 'Ficha médica não encontrada.' };
    this.db.medicalRecords = (this.db.medicalRecords || []).filter((r) => r.id !== id);
    this.healthSafetyAudit(
      'Eliminação de Ficha Médica',
      `Ficha médica de ${target.studentName} (${target.code}) eliminada.`,
      '#b91c1c'
    );
    this.notify();
    return { success: true };
  }

  public addMedicalOccurrence(
    recordId: string,
    occurrence: Omit<MedicalOccurrence, 'id' | 'recordedBy' | 'recordedAt'>
  ): { success: boolean; error?: string; record?: StudentMedicalRecord } {
    const current = (this.db.medicalRecords || []).find((r) => r.id === recordId);
    if (!current) return { success: false, error: 'Ficha médica não encontrada.' };
    if (!occurrence.description.trim()) return { success: false, error: 'Descreva a ocorrência.' };
    const created: MedicalOccurrence = {
      ...occurrence,
      description: occurrence.description.trim(),
      actionTaken: occurrence.actionTaken?.trim() || undefined,
      id: this.newHealthSafetyId('mocc'),
      recordedBy: this.currentActorName(),
      recordedAt: new Date().toISOString()
    };
    const updated: StudentMedicalRecord = { ...current, occurrences: [created, ...current.occurrences] };
    this.db.medicalRecords = (this.db.medicalRecords || []).map((r) => (r.id === recordId ? updated : r));
    this.healthSafetyAudit(
      'Registo de Ocorrência de Saúde',
      `Ocorrência registada na ficha médica de ${current.studentName} (${current.code}).`
    );
    this.notify();
    return { success: true, record: updated };
  }

  // ---------- 2. Incidentes Disciplinares ----------

  public getDisciplinaryIncidents(): DisciplinaryIncident[] {
    return this.db.disciplinaryIncidents || [];
  }

  public saveDisciplinaryIncident(
    input: { id?: string } & IncidentFieldsInput
  ): { success: boolean; error?: string; errors?: string[]; incident?: DisciplinaryIncident } {
    const errors = validateIncident(input);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const participants: IncidentParticipant[] = input.participants.map((p) => {
      const student = (this.db.students || []).find((s) => s.id === p.studentId);
      return {
        studentId: p.studentId,
        studentName: student?.name || 'Aluno não encontrado',
        studentProcNumber: student?.procNumber || '—',
        className: student?.className,
        role: p.role
      };
    });

    const notification: IncidentGuardianNotification = {
      notified: input.guardianNotification.notified,
      date: input.guardianNotification.date,
      channel: input.guardianNotification.channel as IncidentGuardianNotification['channel'],
      notes: input.guardianNotification.notes?.trim() || undefined
    };

    const now = new Date().toISOString();
    if (input.id) {
      const current = (this.db.disciplinaryIncidents || []).find((i) => i.id === input.id);
      if (!current) return { success: false, error: 'Incidente não encontrado.' };
      const updated: DisciplinaryIncident = {
        ...current,
        academicYear: input.academicYear,
        date: input.date,
        time: input.time || undefined,
        location: input.location?.trim() || undefined,
        category: input.category,
        categoryOther: input.category === 'outro' ? input.categoryOther?.trim() : undefined,
        severity: input.severity,
        description: input.description.trim(),
        reportedBy: input.reportedBy.trim(),
        participants,
        guardianNotification: notification,
        updatedAt: now,
        updatedBy: this.currentActorName()
      };
      this.db.disciplinaryIncidents = (this.db.disciplinaryIncidents || []).map((i) => (i.id === input.id ? updated : i));
      this.notify();
      return { success: true, incident: updated };
    }

    const created: DisciplinaryIncident = {
      id: this.newHealthSafetyId('inc'),
      code: generateIncidentCode((this.db.disciplinaryIncidents || []).map((i) => i.code)),
      academicYear: input.academicYear,
      date: input.date,
      time: input.time || undefined,
      location: input.location?.trim() || undefined,
      category: input.category,
      categoryOther: input.category === 'outro' ? input.categoryOther?.trim() : undefined,
      severity: input.severity,
      description: input.description.trim(),
      reportedBy: input.reportedBy.trim(),
      participants,
      status: 'aberto',
      guardianNotification: notification,
      followUps: [],
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.disciplinaryIncidents = [created, ...(this.db.disciplinaryIncidents || [])];
    this.healthSafetyAudit(
      'Registo de Incidente Disciplinar',
      `Novo incidente "${INCIDENT_CATEGORY_LABELS[created.category]}" (${created.code}) registado, envolvendo ${participants.map((p) => p.studentName).join(', ')}.`,
      created.severity === 'muito_grave' ? '#b91c1c' : '#0b1f3a'
    );
    this.notify();
    return { success: true, incident: created };
  }

  public addIncidentFollowUp(id: string, note: string): { success: boolean; error?: string } {
    const current = (this.db.disciplinaryIncidents || []).find((i) => i.id === id);
    if (!current) return { success: false, error: 'Incidente não encontrado.' };
    if (!note.trim()) return { success: false, error: 'Escreva uma nota de seguimento.' };
    const entry: IncidentFollowUp = {
      id: this.newHealthSafetyId('fup'),
      date: new Date().toISOString(),
      note: note.trim(),
      by: this.currentActorName()
    };
    this.db.disciplinaryIncidents = (this.db.disciplinaryIncidents || []).map((i) =>
      i.id === id
        ? { ...i, followUps: [entry, ...i.followUps], status: i.status === 'aberto' ? 'em_analise' : i.status }
        : i
    );
    this.notify();
    return { success: true };
  }

  public decideIncidentMeasure(
    id: string,
    measure: Omit<DisciplinaryMeasure, 'decidedBy' | 'decidedAt'>
  ): { success: boolean; error?: string } {
    const current = (this.db.disciplinaryIncidents || []).find((i) => i.id === id);
    if (!current) return { success: false, error: 'Incidente não encontrado.' };
    const validationError = validateMeasure(measure.type, measure.details, measure.suspensionDays);
    if (validationError) return { success: false, error: validationError };

    const decided: DisciplinaryMeasure = {
      ...measure,
      details: measure.details?.trim() || undefined,
      decidedBy: this.currentActorName(),
      decidedAt: new Date().toISOString()
    };
    this.db.disciplinaryIncidents = (this.db.disciplinaryIncidents || []).map((i) =>
      i.id === id ? { ...i, measure: decided, status: 'decidido' as IncidentStatus } : i
    );
    this.healthSafetyAudit(
      'Decisão de Incidente Disciplinar',
      `Incidente "${current.code}" decidido — medida: ${measure.type}.`
    );
    this.notify();
    return { success: true };
  }

  public archiveDisciplinaryIncident(id: string, reason?: string): { success: boolean; error?: string } {
    const current = (this.db.disciplinaryIncidents || []).find((i) => i.id === id);
    if (!current) return { success: false, error: 'Incidente não encontrado.' };
    this.db.disciplinaryIncidents = (this.db.disciplinaryIncidents || []).map((i) =>
      i.id === id ? { ...i, status: 'arquivado' as IncidentStatus, archiveReason: reason?.trim() || i.archiveReason } : i
    );
    this.notify();
    return { success: true };
  }

  public deleteDisciplinaryIncident(id: string): { success: boolean; error?: string } {
    const target = (this.db.disciplinaryIncidents || []).find((i) => i.id === id);
    if (!target) return { success: false, error: 'Incidente não encontrado.' };
    this.db.disciplinaryIncidents = (this.db.disciplinaryIncidents || []).filter((i) => i.id !== id);
    this.healthSafetyAudit('Eliminação de Incidente Disciplinar', `Incidente "${target.code}" eliminado.`, '#b91c1c');
    this.notify();
    return { success: true };
  }

  // ---------- 3. Autorizações de Recolha ----------

  public getPickupAuthorizations(): PickupAuthorization[] {
    return this.db.pickupAuthorizations || [];
  }

  public getPickupRecords(): PickupRecord[] {
    return this.db.pickupRecords || [];
  }

  public savePickupAuthorization(
    input: { id?: string } & PickupAuthorizationFieldsInput
  ): { success: boolean; error?: string; errors?: string[]; authorization?: PickupAuthorization } {
    const errors = validatePickupAuthorization(input);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };
    const student = (this.db.students || []).find((s) => s.id === input.studentId);
    if (!student) return { success: false, error: 'Aluno não encontrado.' };

    const now = new Date().toISOString();
    if (input.id) {
      const current = (this.db.pickupAuthorizations || []).find((a) => a.id === input.id);
      if (!current) return { success: false, error: 'Autorização não encontrada.' };
      const updated: PickupAuthorization = {
        ...current,
        kind: input.kind,
        personName: input.personName.trim(),
        relation: input.relation,
        relationOther: input.relation === 'outro' ? input.relationOther?.trim() : undefined,
        phone: input.phone.trim(),
        documentNumber: input.documentNumber.trim().toUpperCase(),
        grantedBy: input.grantedBy.trim(),
        grantedVia: input.grantedVia as PickupAuthorization['grantedVia'],
        validFrom: input.validFrom,
        validUntil: input.validUntil || undefined,
        notes: input.notes?.trim() || undefined,
        updatedAt: now,
        updatedBy: this.currentActorName()
      };
      this.db.pickupAuthorizations = (this.db.pickupAuthorizations || []).map((a) => (a.id === input.id ? updated : a));
      this.notify();
      return { success: true, authorization: updated };
    }

    const created: PickupAuthorization = {
      id: this.newHealthSafetyId('rec'),
      code: generatePickupAuthorizationCode((this.db.pickupAuthorizations || []).map((a) => a.code)),
      studentId: input.studentId,
      studentName: student.name,
      studentProcNumber: student.procNumber,
      className: student.className,
      kind: input.kind,
      personName: input.personName.trim(),
      relation: input.relation,
      relationOther: input.relation === 'outro' ? input.relationOther?.trim() : undefined,
      phone: input.phone.trim(),
      documentNumber: input.documentNumber.trim().toUpperCase(),
      grantedBy: input.grantedBy.trim(),
      grantedVia: input.grantedVia as PickupAuthorization['grantedVia'],
      validFrom: input.validFrom,
      validUntil: input.validUntil || undefined,
      status: 'ativa',
      notes: input.notes?.trim() || undefined,
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.pickupAuthorizations = [created, ...(this.db.pickupAuthorizations || [])];
    this.healthSafetyAudit(
      created.kind === 'proibida' ? 'Registo de Restrição de Recolha' : 'Registo de Autorização de Recolha',
      `${created.kind === 'proibida' ? 'Restrição' : 'Autorização'} para ${created.personName} recolher ${created.studentName} (${created.code}) registada.`,
      created.kind === 'proibida' ? '#b91c1c' : '#0b1f3a'
    );
    this.notify();
    return { success: true, authorization: created };
  }

  public changePickupAuthorizationStatus(
    id: string,
    status: PickupAuthorization['status'],
    reason?: string
  ): { success: boolean; error?: string } {
    const current = (this.db.pickupAuthorizations || []).find((a) => a.id === id);
    if (!current) return { success: false, error: 'Autorização não encontrada.' };
    this.db.pickupAuthorizations = (this.db.pickupAuthorizations || []).map((a) =>
      a.id === id
        ? { ...a, status, statusReason: reason?.trim() || undefined, updatedAt: new Date().toISOString(), updatedBy: this.currentActorName() }
        : a
    );
    this.notify();
    return { success: true };
  }

  public deletePickupAuthorization(id: string): { success: boolean; error?: string } {
    const target = (this.db.pickupAuthorizations || []).find((a) => a.id === id);
    if (!target) return { success: false, error: 'Autorização não encontrada.' };
    this.db.pickupAuthorizations = (this.db.pickupAuthorizations || []).filter((a) => a.id !== id);
    this.notify();
    return { success: true };
  }

  /** Regista, à porta, uma saída/recolha efetuada ou uma tentativa recusada. */
  public registerPickup(input: {
    studentId: string;
    date: string;
    time: string;
    authorizationId?: string;
    personName: string;
    personRelation: string;
    personDocument: string;
    reason: PickupReason;
    reasonOther?: string;
    guardianConfirmedBy?: string;
    documentVerified: boolean;
    notes?: string;
  }): { success: boolean; error?: string; record?: PickupRecord } {
    const student = (this.db.students || []).find((s) => s.id === input.studentId);
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    if (!input.personName.trim()) return { success: false, error: 'Indique o nome de quem recolheu o aluno.' };
    if (input.reason === 'outro' && !(input.reasonOther || '').trim()) {
      return { success: false, error: 'Descreva o motivo quando escolher "Outro".' };
    }

    const forbidden = isPersonForbiddenForStudent(
      this.db.pickupAuthorizations || [],
      input.studentId,
      input.personDocument,
      input.date
    );
    const now = new Date().toISOString();

    if (forbidden) {
      const record: PickupRecord = {
        id: this.newHealthSafetyId('pkp'),
        date: input.date,
        time: input.time,
        studentId: student.id,
        studentName: student.name,
        studentProcNumber: student.procNumber,
        className: student.className,
        personName: input.personName.trim(),
        personRelation: input.personRelation,
        personDocument: input.personDocument.trim().toUpperCase(),
        reason: input.reason,
        reasonOther: input.reason === 'outro' ? input.reasonOther?.trim() : undefined,
        outcome: 'recusada',
        refusalReason: `Pessoa com restrição ativa de recolha para este aluno (autorização ${forbidden.code}).`,
        documentVerified: input.documentVerified,
        notes: input.notes?.trim() || undefined,
        registeredBy: this.currentActorName(),
        createdAt: now
      };
      this.db.pickupRecords = [record, ...(this.db.pickupRecords || [])];
      this.healthSafetyAudit(
        'Recolha Recusada',
        `Recolha de ${student.name} por ${record.personName} recusada — pessoa com restrição ativa (${forbidden.code}).`,
        '#b91c1c'
      );
      this.notify();
      return { success: true, record };
    }

    const record: PickupRecord = {
      id: this.newHealthSafetyId('pkp'),
      date: input.date,
      time: input.time,
      studentId: student.id,
      studentName: student.name,
      studentProcNumber: student.procNumber,
      className: student.className,
      authorizationId: input.authorizationId,
      personName: input.personName.trim(),
      personRelation: input.personRelation,
      personDocument: input.personDocument.trim().toUpperCase(),
      reason: input.reason,
      reasonOther: input.reason === 'outro' ? input.reasonOther?.trim() : undefined,
      outcome: 'entregue',
      guardianConfirmedBy: input.guardianConfirmedBy?.trim() || undefined,
      documentVerified: input.documentVerified,
      notes: input.notes?.trim() || undefined,
      registeredBy: this.currentActorName(),
      createdAt: now
    };
    this.db.pickupRecords = [record, ...(this.db.pickupRecords || [])];
    this.notify();
    return { success: true, record };
  }

  // ------------------------------------------------------------------
  // Serviços 4 — Vínculo / Desvínculo de Filhos
  //
  // O que cada Encarregado vê no Portal Online é decidido por
  // `resolveGuardianChildren` (utils/guardianLinks.ts): vínculos ativos +
  // acesso herdado da ficha do aluno, exceto os pares desvinculados.
  // ------------------------------------------------------------------
  private currentActorName(): string {
    return this.db.currentUser?.name?.trim() || 'Sistema';
  }

  public getGuardianLinks(): GuardianStudentLink[] {
    return this.db.guardianLinks || [];
  }

  public linkGuardianToStudent(input: {
    guardianUserId: string;
    studentId: string;
    relation: GuardianRelation;
    relationOther?: string;
    financialResponsible?: boolean;
    notes?: string;
  }): { success: boolean; error?: string; link?: GuardianStudentLink } {
    const guardian = (this.db.users || []).find((u) => u.id === input.guardianUserId && u.role === 'encarregado');
    if (!guardian) return { success: false, error: 'Conta de Encarregado de Educação não encontrada.' };
    const student = (this.db.students || []).find((s) => s.id === input.studentId);
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    if (student.status === 'transferred') {
      return { success: false, error: 'Este aluno foi transferido — não é possível vincular um novo Encarregado.' };
    }
    if (input.relation === 'outro' && !(input.relationOther || '').trim()) {
      return { success: false, error: 'Descreva o grau de parentesco / relação com o aluno.' };
    }

    const existing = resolveGuardianChildren(guardian, this.db.students || [], this.db.guardianLinks || []).find(
      (c) => c.student.id === student.id
    );
    if (existing?.source === 'vinculo') {
      return { success: false, error: `${guardian.name} já está vinculado(a) a ${student.name}.` };
    }

    const link: GuardianStudentLink = {
      id: `vin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      guardianUserId: guardian.id,
      guardianName: guardian.name,
      guardianEmail: guardian.email || '',
      studentId: student.id,
      studentName: student.name,
      studentProcNumber: student.procNumber,
      relation: input.relation,
      relationOther: input.relation === 'outro' ? (input.relationOther || '').trim() : undefined,
      financialResponsible: !!input.financialResponsible,
      status: 'ativo',
      origin: 'manual',
      linkedAt: new Date().toISOString(),
      linkedBy: this.currentActorName(),
      notes: (input.notes || '').trim() || undefined
    };
    this.db.guardianLinks = [link, ...(this.db.guardianLinks || [])];
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: 'Secretaria',
      action: 'Vínculo de Educando',
      details: `${guardian.name} vinculado(a) ao aluno ${student.name} (nº ${student.procNumber}).`,
      module: 'alunos',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true, link };
  }

  public unlinkGuardianFromStudent(input: {
    guardianUserId: string;
    studentId: string;
    reason: GuardianUnlinkReason;
    notes?: string;
  }): { success: boolean; error?: string } {
    const guardian = (this.db.users || []).find((u) => u.id === input.guardianUserId && u.role === 'encarregado');
    if (!guardian) return { success: false, error: 'Conta de Encarregado de Educação não encontrada.' };
    const student = (this.db.students || []).find((s) => s.id === input.studentId);
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    const notes = (input.notes || '').trim();
    if (input.reason === 'outro' && !notes) {
      return { success: false, error: 'Descreva o motivo do desvínculo.' };
    }

    const current = resolveGuardianChildren(guardian, this.db.students || [], this.db.guardianLinks || []).find(
      (c) => c.student.id === student.id
    );
    if (!current) {
      return { success: false, error: `${guardian.name} já não tem acesso a ${student.name}.` };
    }

    const now = new Date().toISOString();
    const actor = this.currentActorName();
    if (current.link) {
      // Vínculo registado: passa a "desvinculado" (o registo fica como histórico).
      this.db.guardianLinks = (this.db.guardianLinks || []).map((l) =>
        l.id === current.link!.id
          ? { ...l, status: 'desvinculado', unlinkedAt: now, unlinkedBy: actor, unlinkReason: input.reason, unlinkNotes: notes || undefined }
          : l
      );
    } else {
      // Acesso herdado da ficha: não há vínculo a fechar, por isso regista-se um
      // desvínculo que BLOQUEIA o acesso implícito (senão a ficha continuava a abri-lo).
      const blocked: GuardianStudentLink = {
        id: `vin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        guardianUserId: guardian.id,
        guardianName: guardian.name,
        guardianEmail: guardian.email || '',
        studentId: student.id,
        studentName: student.name,
        studentProcNumber: student.procNumber,
        relation: relationFromText(student.guardianRelation),
        financialResponsible: false,
        status: 'desvinculado',
        origin: 'ficha',
        linkedAt: now,
        linkedBy: actor,
        unlinkedAt: now,
        unlinkedBy: actor,
        unlinkReason: input.reason,
        unlinkNotes: notes || undefined
      };
      this.db.guardianLinks = [blocked, ...(this.db.guardianLinks || [])];
    }

    this.addAuditLog({
      userName: actor,
      userRole: 'Secretaria',
      action: 'Desvínculo de Educando',
      details: `${guardian.name} desvinculado(a) do aluno ${student.name} (nº ${student.procNumber}).`,
      module: 'alunos',
      timestamp: 'Agora mesmo',
      badgeColor: '#7a0c0c'
    });
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Serviços 5 — Pré-Matrícula / Admissões
  // ------------------------------------------------------------------
  public getAdmissions(): Admission[] {
    return this.db.admissions || [];
  }

  public addAdmission(
    input: Omit<Admission, 'id' | 'code' | 'status' | 'history' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'documents'> & {
      documents?: AdmissionDocument[];
    }
  ): { success: boolean; error?: string; errors?: string[]; admission?: Admission } {
    const errors = validateAdmission({
      name: input.name,
      birthDate: input.birthDate,
      desiredGrade: input.desiredGrade,
      guardianName: input.guardianName,
      guardianPhone: input.guardianPhone,
      email: input.email,
      guardianEmail: input.guardianEmail,
      assessmentScore: input.assessmentScore
    });
    if (!input.academicYear?.trim()) errors.push('Indique o ano letivo da candidatura.');
    if (errors.length > 0) return { success: false, error: errors[0], errors };

    const dupStudent = findDuplicateStudent(this.db.students || [], input);
    if (dupStudent) {
      return {
        success: false,
        error: `${dupStudent.name} já está cadastrado(a) como aluno (nº ${dupStudent.procNumber}). Para um aluno da escola, use "Matrículas".`
      };
    }
    const dupAdmission = findDuplicateAdmission(this.db.admissions || [], input);
    if (dupAdmission) {
      return {
        success: false,
        error: `Já existe a candidatura ${dupAdmission.code} (${ADMISSION_STATUS_META[dupAdmission.status].label}) para este candidato neste ano letivo.`
      };
    }

    const now = new Date().toISOString();
    const actor = this.currentActorName();
    const created: Admission = {
      ...input,
      name: input.name.trim(),
      guardianName: input.guardianName.trim(),
      guardianPhone: input.guardianPhone.trim(),
      id: `adm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateAdmissionCode(input.academicYear, (this.db.admissions || []).map((a) => a.code)),
      status: 'recebida',
      documents: input.documents && input.documents.length > 0 ? input.documents : emptyDocuments(),
      history: [{ at: now, by: actor, text: 'Candidatura registada.' }],
      createdAt: now,
      createdBy: actor
    };
    this.db.admissions = [created, ...(this.db.admissions || [])];
    this.addAuditLog({
      userName: actor,
      userRole: 'Secretaria',
      action: 'Nova Candidatura (Pré-Matrícula)',
      details: `Candidatura ${created.code} registada para ${created.name} — ${created.desiredGrade}.`,
      module: 'alunos',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true, admission: created };
  }

  public updateAdmission(
    id: string,
    updates: Partial<Omit<Admission, 'id' | 'code' | 'status' | 'history' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>>
  ): { success: boolean; error?: string; errors?: string[] } {
    const current = (this.db.admissions || []).find((a) => a.id === id);
    if (!current) return { success: false, error: 'Candidatura não encontrada.' };
    if (current.status === 'convertida') {
      return { success: false, error: 'Esta candidatura já foi convertida em aluno — edite a ficha em "Alunos".' };
    }
    const merged: Admission = { ...current, ...updates };
    const errors = validateAdmission({
      name: merged.name,
      birthDate: merged.birthDate,
      desiredGrade: merged.desiredGrade,
      guardianName: merged.guardianName,
      guardianPhone: merged.guardianPhone,
      email: merged.email,
      guardianEmail: merged.guardianEmail,
      assessmentScore: merged.assessmentScore
    });
    if (errors.length > 0) return { success: false, error: errors[0], errors };

    const dupAdmission = findDuplicateAdmission(this.db.admissions || [], merged, id);
    if (dupAdmission) {
      return { success: false, error: `Já existe outra candidatura (${dupAdmission.code}) para este candidato neste ano letivo.` };
    }
    const dupStudent = findDuplicateStudent(this.db.students || [], merged);
    if (dupStudent) {
      return { success: false, error: `${dupStudent.name} já está cadastrado(a) como aluno (nº ${dupStudent.procNumber}).` };
    }

    this.db.admissions = (this.db.admissions || []).map((a) =>
      a.id === id
        ? { ...merged, name: merged.name.trim(), updatedAt: new Date().toISOString(), updatedBy: this.currentActorName() }
        : a
    );
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Pré-Matrícula Online (link público, sem autenticação)
  //
  // Um candidato/encarregado que preenche o formulário público (ver
  // PreMatriculaPublicaView) NUNCA escreve diretamente em `admissions` — essa
  // árvore está dentro do documento institucional protegido, que exige sessão
  // autenticada (ver supabase/migrations/0009_replace_firebase.sql). Em vez disso a submissão fica num
  // nó próprio e público-apenas-para-escrita, `public_admission_requests/
  // {institutionId}/{id}`, que ninguém de fora consegue ler. A Secretaria
  // importa essas submissões pendentes (importPendingOnlineAdmissionRequests)
  // a partir de "Serviços → Pré-Matrícula / Admissões", altura em que cada uma
  // passa a ser uma Admission normal (source: 'online') e o registo bruto é
  // apagado — os dados ficam então só na secção Pré-Matrícula / Admissões.
  // ------------------------------------------------------------------

  /** Identificador de pedido que ordena por hora de chegada (a importação por fases segue esta ordem). */
  private newAdmissionRequestId(): string {
    const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
    return Date.now().toString(36).padStart(9, '0') + '_' + rnd;
  }

  /** Chamado a partir do formulário público, sem sessão iniciada. */
  public async submitPublicAdmissionRequest(
    input: Omit<PublicAdmissionRequest, 'id' | 'submittedAt'>
  ): Promise<{ success: boolean; error?: string; errors?: string[]; publicRef?: string }> {
    const errors = validateAdmission({
      name: input.name,
      birthDate: input.birthDate,
      desiredGrade: input.desiredGrade,
      guardianName: input.guardianName,
      guardianPhone: input.guardianPhone,
      email: input.email,
      guardianEmail: input.guardianEmail
    });
    if (!input.academicYear?.trim()) errors.push('Indique o ano letivo pretendido.');
    const docs = Array.isArray(input.documents) ? input.documents : [];
    if (docs.length > 6) errors.push('Demasiados anexos.');
    let totalChars = 0;
    for (const d of docs) {
      const len = d?.dataUrl?.length || 0;
      totalChars += len;
      const okType = /^data:(image\/|application\/pdf)/.test(d?.dataUrl || '');
      if (!okType || len === 0 || len > ATTACHMENT_LIMITS.maxDataUrlChars) {
        errors.push(`O anexo "${d?.label || d?.fileName || 'documento'}" não é válido ou é demasiado grande.`);
      }
    }
    if (totalChars > ATTACHMENT_LIMITS.maxTotalChars) errors.push('O total de anexos é demasiado grande.');
    if (errors.length > 0) return { success: false, error: errors[0], errors };

    try {
      const cfg = await this.fetchPublicAdmissionConfig();
      if (cfg.deleted) return { success: false, error: 'Este link de Pré-Matrícula já não está ativo.' };
      if (cfg.blocked) return { success: false, error: 'As candidaturas estão encerradas neste momento.' };

      const now = new Date().toISOString();
      const publicRef = newPublicRef();
      const statusKey = newStatusKey();
      const requestId = this.newAdmissionRequestId();
      const record: PublicAdmissionRequest = {
        ...input,
        name: input.name.trim(),
        guardianName: input.guardianName.trim(),
        guardianPhone: input.guardianPhone.trim(),
        id: requestId,
        publicRef,
        statusKey,
        submittedAt: now
      };

      // 1) Registo de consulta (estado "recebida") + índices, para o candidato poder consultar de imediato.
      const asAdmission: any = {
        ...record, code: undefined, status: 'recebida', createdAt: now,
        documents: (input.documents || []).map((d) => ({ key: d.key, label: d.label, delivered: true, attachment: d }))
      };
      const statusRec = buildStatusRecord(asAdmission, { statusKey, schoolName: this.db.settings?.schoolName });
      const inst = this.activeInstitutionId;
      const indexKeys: string[] = [];
      for (const id of [record.biNumber, publicRef]) {
        const ix = await lookupIndexKey(inst, id || '', record.birthDate);
        if (ix) indexKeys.push(ix);
      }
      // 2) Uma única chamada ao servidor valida tudo e grava submissão + estado + índices (só acrescenta, nunca sobrepõe).
      await cloud.submitAdmission(inst, stripUndefinedDeep(record), statusKey, stripUndefinedDeep(statusRec), indexKeys);
      return { success: true, publicRef } as any;
    } catch (e: any) {
      // Não esconder a causa real: o servidor devolve motivos curtos (link_inactivo, caixa_cheia...).
      const msg = String(e?.message || '').toLowerCase();
      console.error('[Pré-Matrícula] Falha ao enviar candidatura:', e);
      if (msg.includes('link_inactivo')) return { success: false, error: 'Este link de Pré-Matrícula já não está ativo.' };
      if (msg.includes('candidaturas_encerradas')) return { success: false, error: 'As candidaturas estão encerradas neste momento.' };
      if (msg.includes('caixa_cheia') || msg.includes('demasiados_pedidos')) {
        return { success: false, error: 'O sistema está com muitos pedidos neste momento. Tente novamente dentro de alguns minutos.' };
      }
      if (msg.includes('escola_inexistente') || msg.includes('pedido_invalido')) {
        return { success: false, error: 'Não foi possível enviar a candidatura. Confira os dados e o link da escola.' };
      }
      const offline =
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        msg.includes('network') || msg.includes('fetch') || msg.includes('timeout');
      return {
        success: false,
        error: offline
          ? 'Sem ligação ao servidor neste momento. Verifique a ligação à internet e tente novamente em instantes.'
          : 'Não foi possível enviar a candidatura. Tente novamente e, se persistir, contacte a Secretaria.'
      };
    }
  }

  // ---- Link público: estado (bloqueado / eliminado) ---------------------

  /** Público (sem sessão): lê se o link está bloqueado ou eliminado. Em falta = ativo. */
  public async fetchPublicAdmissionConfig(): Promise<PublicAdmissionConfig> {
    try {
      return (await cloud.fetchAdmissionConfig(this.activeInstitutionId)) as PublicAdmissionConfig;
    } catch {
      return {};
    }
  }

  public async setPublicAdmissionConfig(patch: Partial<Pick<PublicAdmissionConfig, 'blocked' | 'deleted' | 'complaintsBlocked'>>): Promise<{ success: boolean; error?: string }> {
    try {
      const current = await this.fetchPublicAdmissionConfig();
      const next: PublicAdmissionConfig = {
        blocked: !!(patch.blocked ?? current.blocked),
        deleted: !!(patch.deleted ?? current.deleted),
        complaintsBlocked: !!(patch.complaintsBlocked ?? current.complaintsBlocked),
        updatedAt: new Date().toISOString(),
        updatedBy: this.currentActorName()
      };
      // Mantém a identidade pública da escola (nome + logótipo) já publicada.
      if (current.schoolName) next.schoolName = current.schoolName;
      if (current.logoUrl) next.logoUrl = current.logoUrl;
      await cloud.saveAdmissionConfig(this.activeInstitutionId, stripUndefinedDeep(next) as any);
      this.addAuditLog({
        userName: this.currentActorName(), userRole: 'Secretaria', action: 'Link da Pré-Matrícula Online',
        details: patch.complaintsBlocked !== undefined ? (next.complaintsBlocked ? 'Reclamações bloqueadas no link público.' : 'Reclamações liberadas no link público.') : next.deleted ? 'Link eliminado: o formulário e a consulta deixam de estar acessíveis.' : next.blocked ? 'Candidaturas bloqueadas no link público.' : 'Link ativo: candidaturas abertas.',
        module: 'alunos', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'Não foi possível guardar o estado do link. Verifique a ligação e as permissões.' };
    }
  }

  /**
   * Publica o nome e o LOGÓTIPO DA ESCOLA (Definições → Dados da Instituição) para o link público,
   * que não tem sessão e por isso não consegue ler as definições internas. Só escreve se mudou.
   */
  public async publishPublicSchoolBrand(): Promise<void> {
    if (!isSignedIn()) return;
    try {
      const logo = this.db.settings?.logoUrl || '';
      const logoUrl = logo && logo.length < 380000 ? logo : '';
      const schoolName = (this.db.settings?.schoolName || '').slice(0, 160);
      const current = await this.fetchPublicAdmissionConfig();
      if ((current.logoUrl || '') === logoUrl && (current.schoolName || '') === schoolName) return;
      const next: Record<string, any> = { ...current, logoUrl: logoUrl || undefined, schoolName: schoolName || undefined };
      if (!next.updatedAt) next.updatedAt = new Date().toISOString();
      await cloud.saveAdmissionConfig(this.activeInstitutionId, stripUndefinedDeep(next) as any);
    } catch (e) {
      console.warn('[Candidaturas Online] Não foi possível publicar o logótipo da escola:', e);
    }
  }

  // ---- Reclamações (candidato → Secretaria) -------------------------------

  /** Público (sem sessão): candidato rejeitado ou com nota 0–9 envia uma reclamação (uma por candidatura). */
  public async submitPublicAdmissionComplaint(
    rec: PublicAdmissionStatus,
    input: { reason: string; description: string; contactPhone?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const reason = (input.reason || '').trim();
    const description = (input.description || '').trim();
    if (!reason) return { success: false, error: 'Selecione o motivo da reclamação.' };
    if (description.length < 10) return { success: false, error: 'Descreva a reclamação (mínimo de 10 caracteres).' };
    if (description.length > 2000) return { success: false, error: 'A descrição é demasiado longa (máximo de 2000 caracteres).' };
    try {
      const cfg = await this.fetchPublicAdmissionConfig();
      if (cfg.deleted) return { success: false, error: 'Este link já não está ativo.' };
      if (cfg.complaintsBlocked) return { success: false, error: 'As reclamações estão encerradas neste momento.' };
      const complaint: Omit<AdmissionComplaint, 'id'> = {
        rk: rec.rk,
        ref: rec.ref || '',
        code: rec.code,
        candidateName: rec.name,
        academicYear: rec.academicYear,
        status: rec.status,
        assessmentScore: typeof rec.assessmentScore === 'number' ? rec.assessmentScore : undefined,
        reason,
        description,
        contactPhone: input.contactPhone?.trim() || rec.guardianPhone || undefined,
        submittedAt: new Date().toISOString()
      };
      await cloud.submitComplaint(this.activeInstitutionId, rec.rk, stripUndefinedDeep(complaint));
      return { success: true };
    } catch (e: any) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('reclamacao_duplicada')) {
        return { success: false, error: 'Já existe uma reclamação registada para esta candidatura. A Secretaria irá analisá-la.' };
      }
      if (msg.includes('link_inactivo')) return { success: false, error: 'Este link já não está ativo.' };
      if (msg.includes('reclamacoes_encerradas')) return { success: false, error: 'As reclamações estão encerradas neste momento.' };
      return { success: false, error: 'Não foi possível enviar a reclamação. Verifique a ligação e tente novamente.' };
    }
  }

  /** Público: lê a reclamação já feita por esta candidatura (chave aleatória rk_…), se existir. */
  public async fetchPublicAdmissionComplaint(rk: string): Promise<AdmissionComplaint | null> {
    try {
      if (!rk) return null;
      const d = await cloud.getComplaintPublic(this.activeInstitutionId, rk);
      return d ? ({ ...(d as AdmissionComplaint), id: rk }) : null;
    } catch {
      return null;
    }
  }

  /** Secretaria: responde a uma reclamação (a resposta aparece na Consulta do candidato). */
  public async answerAdmissionComplaint(id: string, response: string): Promise<{ success: boolean; error?: string }> {
    const text = (response || '').trim();
    if (!text) return { success: false, error: 'Escreva a resposta.' };
    if (text.length > 2000) return { success: false, error: 'A resposta é demasiado longa (máximo de 2000 caracteres).' };
    try {
      await cloud.patchComplaint(this.activeInstitutionId, id, {
        response: text,
        respondedAt: new Date().toISOString(),
        respondedBy: this.currentActorName(),
        resolved: true,
        resolvedAt: new Date().toISOString(),
        resolvedBy: this.currentActorName()
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Não foi possível guardar a resposta.' };
    }
  }

  /** Secretaria: lista as reclamações recebidas (mais recentes primeiro). */
  public async getAdmissionComplaints(): Promise<AdmissionComplaint[]> {
    try {
      const val = await cloud.listComplaints(this.activeInstitutionId);
      return Object.keys(val)
        .map((k) => ({ ...(val[k] as AdmissionComplaint), id: k }))
        .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    } catch {
      return [];
    }
  }

  public async setAdmissionComplaintResolved(id: string, resolved: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      await cloud.patchComplaint(this.activeInstitutionId, id, {
        resolved,
        resolvedAt: resolved ? new Date().toISOString() : null,
        resolvedBy: resolved ? this.currentActorName() : null
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Não foi possível atualizar a reclamação.' };
    }
  }

  public async deleteAdmissionComplaint(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await cloud.deleteComplaint(this.activeInstitutionId, id);
      return { success: true };
    } catch {
      return { success: false, error: 'Não foi possível eliminar a reclamação.' };
    }
  }

  // ---- Consulta pública do estado da candidatura -------------------------

  /** Público (sem sessão): procura pelo B.I., nº de Pré-Matrícula ou código + data de nascimento. */
  public async lookupPublicAdmission(id: string, birthDate: string): Promise<{ success: boolean; record?: PublicAdmissionStatus; error?: string }> {
    const notFound = { success: false, error: 'Não encontrámos nenhuma candidatura com estes dados. Confira o número e a data de nascimento.' };
    try {
      const ix = await lookupIndexKey(this.activeInstitutionId, id, birthDate);
      if (!ix) return { success: false, error: 'Indique o nº do B.I. ou da Pré-Matrícula e a data de nascimento.' };
      const rec = await cloud.lookupAdmissionStatus(this.activeInstitutionId, ix);
      if (!rec) return notFound;
      return { success: true, record: rec as PublicAdmissionStatus };
    } catch {
      return { success: false, error: 'Não foi possível consultar neste momento. Tente novamente dentro de instantes.' };
    }
  }

  // ---- Publicação do estado (Secretaria → consulta pública) ---------------

  private statusSyncTimer: any = null;
  private statusSyncRefs: { adm?: unknown; mat?: unknown } = {};
  private statusSyncRunning = false;

  private scheduleAdmissionStatusSync() {
    if (typeof window === 'undefined' || !isSignedIn()) return;
    if (this.statusSyncRefs.adm === this.db.admissions && this.statusSyncRefs.mat === this.db.matriculas) return;
    if (this.statusSyncTimer) clearTimeout(this.statusSyncTimer);
    this.statusSyncTimer = setTimeout(() => { void this.syncAdmissionStatuses(); }, 2000);
  }

  private async writeStatusRecord(rec: PublicAdmissionStatus, ids: string[], birthDate: string) {
    const keys: string[] = [];
    for (const id of ids) {
      const ix = await lookupIndexKey(this.activeInstitutionId, id, birthDate);
      if (ix) keys.push(ix);
    }
    await cloud.writeAdmissionStatus(this.activeInstitutionId, rec.rk, stripUndefinedDeep(rec), keys);
  }

  private matriculaNumberFor(studentId?: string): string | undefined {
    if (!studentId) return undefined;
    const list = (this.db.matriculas || []).filter((m) => String(m.studentId) === String(studentId) && m.estado !== 'cancelada' && m.estado !== 'transferida');
    return list.sort((a, b) => String(b.academicYear).localeCompare(String(a.academicYear)))[0]?.numeroMatricula;
  }

  /**
   * Publica na Consulta pública o estado das candidaturas que mudaram (estado, nota, avaliação,
   * nº de matrícula…). Corre em segundo plano, em lotes, e só com sessão iniciada.
   */
  public async syncAdmissionStatuses(): Promise<void> {
    if (this.statusSyncRunning || !isSignedIn()) return;
    this.statusSyncRunning = true;
    try {
      const snapshot = this.db.admissions || [];
      const updates = new Map<string, Partial<Admission>>();
      let budget = 20;
      for (const a of snapshot) {
        if (budget <= 0) break;
        const statusKey = a.statusKey || newStatusKey();
        const publicRef = a.publicRef || newPublicRef();
        const withIds: Admission = { ...a, statusKey, publicRef };
        const rec = buildStatusRecord(withIds, { statusKey, matriculaNumber: this.matriculaNumberFor(a.studentId), schoolName: this.db.settings?.schoolName });
        const sig = statusSignature(rec);
        if (sig === a.publicSyncSig && a.statusKey && a.publicRef) continue;
        budget--;
        try {
          await this.writeStatusRecord(rec, lookupIdsOf(withIds), a.birthDate);
          updates.set(a.id, { statusKey, publicRef, publicSyncSig: sig });
        } catch (e) {
          console.warn('[Pré-Matrícula] Não foi possível publicar o estado de', a.code, e);
        }
      }
      if (updates.size > 0) {
        this.db.admissions = (this.db.admissions || []).map((x) => (updates.has(x.id) ? { ...x, ...updates.get(x.id)! } : x));
        this.statusSyncRefs = { adm: this.db.admissions, mat: this.db.matriculas };
        this.notifyLocal();
        this.scheduleSync();
      } else {
        this.statusSyncRefs = { adm: this.db.admissions, mat: this.db.matriculas };
      }
      if (budget <= 0) this.statusSyncTimer = setTimeout(() => { this.statusSyncRefs = {}; void this.syncAdmissionStatuses(); }, 1500);
    } finally {
      this.statusSyncRunning = false;
    }
  }

  private async unpublishAdmissionStatus(a: Admission) {
    if (!a.statusKey || !isSignedIn()) return;
    try {
      const keys = [a.statusKey];
      for (const id of lookupIdsOf(a)) {
        const ix = await lookupIndexKey(this.activeInstitutionId, id, a.birthDate);
        if (ix) keys.push(ix);
      }
      await cloud.removeAdmissionStatus(this.activeInstitutionId, keys);
    } catch { /* best-effort */ }
  }

  // ---- Importação por fases ---------------------------------------------

  /** Nº de submissões por importar (contagem no servidor, sem descarregar os anexos). */
  public async countPendingOnlineAdmissionRequests(): Promise<number> {
    try {
      return await cloud.countAdmissionRequests(this.activeInstitutionId);
    } catch {
      return 0;
    }
  }

  /** Lê (sem importar) as submissões públicas pendentes — para pré-visualização na Secretaria. */
  public async getPendingOnlineAdmissionRequests(): Promise<PublicAdmissionRequest[]> {
    try {
      const val = await cloud.listAdmissionRequests(this.activeInstitutionId);
      return Object.keys(val).map((key) => ({ ...(val[key] as PublicAdmissionRequest), id: key }));
    } catch {
      return [];
    }
  }

  /**
   * Importa UMA fase (até `limit`, por omissão 50) das submissões públicas, por ordem de chegada, a
   * partir de `afterKey`. Cada submissão passa pelas mesmas regras de `addAdmission` (duplicados
   * incluídos). As importadas e as duplicadas saem da caixa pública; as que falham ficam lá.
   */
  public async importOnlineAdmissionPhase(afterKey?: string, limit = IMPORT_PHASE_SIZE): Promise<{
    imported: number; duplicates: number; errors: string[]; processed: number; lastKey?: string; done: boolean;
  }> {
    const val = await cloud.listAdmissionRequests(this.activeInstitutionId, { afterId: afterKey, limit });
    const keys = Object.keys(val).sort();
    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const key of keys) {
      const req = { ...(val[key] as PublicAdmissionRequest), id: key };
      const { id, submittedAt, documents: uploaded, publicRef, statusKey, ...payload } = req;
      const uploadedList = Array.isArray(uploaded) ? uploaded : Object.values((uploaded as any) || {});
      const documents = emptyDocuments().map((d) => {
        const up: any = uploadedList.find((u: any) => u && u.key === d.key);
        if (!up || !up.dataUrl) return d;
        return { ...d, delivered: true, attachment: { fileName: up.fileName, mimeType: up.mimeType, size: up.size, dataUrl: up.dataUrl } };
      });
      const keyToUse = statusKey || newStatusKey();
      const refToUse = publicRef || newPublicRef();
      const dup = findDuplicateAdmission(this.db.admissions || [], payload as any);
      let removeIt = false;
      if (dup) {
        duplicates++;
        removeIt = true;
        // O candidato que reenviou continua a poder consultar: o seu registo espelha a candidatura existente.
        try {
          const rec = buildStatusRecord(dup, { statusKey: keyToUse, matriculaNumber: this.matriculaNumberFor(dup.studentId), schoolName: this.db.settings?.schoolName });
          await this.writeStatusRecord(rec, [], dup.birthDate);
        } catch { /* best-effort */ }
      } else {
        const result = this.addAdmission({ ...payload, documents, source: 'online', publicRef: refToUse, statusKey: keyToUse } as any);
        if (result.success) { imported++; removeIt = true; }
        else if (/já existe|já está cadastrado/i.test(result.error || '')) { duplicates++; removeIt = true; }
        else errors.push(`${req.name || 'Candidatura'}: ${result.error || 'não foi possível importar.'}`);
      }
      if (removeIt) {
        try { await cloud.deleteAdmissionRequest(this.activeInstitutionId, key); } catch { /* a próxima importação tenta de novo */ }
      }
    }
    return { imported, duplicates, errors, processed: keys.length, lastKey: keys[keys.length - 1], done: keys.length < limit };
  }

  /** Importa tudo, fase a fase, fase a fase (50 de cada vez). `onPhase` recebe o progresso depois de cada fase. */
  public async importPendingOnlineAdmissionRequests(
    onPhase?: (p: { phase: number; imported: number; duplicates: number; processed: number }) => void
  ): Promise<{ imported: number; duplicates: number; errors: string[] }> {
    let imported = 0;
    let duplicates = 0;
    let processed = 0;
    let phase = 0;
    const errors: string[] = [];
    let lastKey: string | undefined;
    for (;;) {
      const r = await this.importOnlineAdmissionPhase(lastKey);
      phase++;
      imported += r.imported; duplicates += r.duplicates; processed += r.processed; errors.push(...r.errors);
      onPhase?.({ phase, imported, duplicates, processed });
      lastKey = r.lastKey;
      if (r.done || !lastKey) break;
      await new Promise((res) => setTimeout(res, 0)); // deixa a interface respirar entre fases
    }
    return { imported, duplicates, errors };
  }

  public changeAdmissionStatus(
    id: string,
    to: AdmissionStatus,
    options: {
      reason?: string;
      /** Aprovar mesmo sem vagas livres na classe (decisão consciente da Direção). */
      allowOverCapacity?: boolean;
      /** Agendamento da avaliação, exigido ao passar para "Avaliação Agendada". */
      assessment?: { type: AdmissionAssessmentType; date: string };
    } = {}
  ): { success: boolean; error?: string; needsCapacityOverride?: boolean } {
    const current = (this.db.admissions || []).find((a) => a.id === id);
    if (!current) return { success: false, error: 'Candidatura não encontrada.' };
    if (to === 'convertida') {
      return { success: false, error: 'A conversão em aluno faz-se com o botão "Converter em Aluno".' };
    }
    if (!canTransition(current.status, to)) {
      return {
        success: false,
        error: `Não é possível passar de "${ADMISSION_STATUS_META[current.status].label}" para "${ADMISSION_STATUS_META[to].label}".`
      };
    }
    const reason = (options.reason || '').trim();
    if (to === 'rejeitada' && !reason) {
      return { success: false, error: 'Indique o motivo da rejeição — fica registado na candidatura.' };
    }

    let assessmentType = current.assessmentType;
    let assessmentDate = current.assessmentDate;
    if (to === 'avaliacao_agendada') {
      assessmentType = options.assessment?.type || assessmentType;
      assessmentDate = options.assessment?.date || assessmentDate;
      if (!assessmentType || !assessmentDate) {
        return { success: false, error: 'Indique o tipo e a data da avaliação de admissão.' };
      }
    }

    if (to === 'aprovada') {
      const vacancies = computeVacancies(
        this.db.classes || [],
        this.db.admissions || [],
        current.desiredGrade,
        current.academicYear,
        current.id
      );
      if (vacancies.classesCount > 0 && vacancies.available <= 0 && !options.allowOverCapacity) {
        return {
          success: false,
          needsCapacityOverride: true,
          error: `Não há vagas livres em ${current.desiredGrade} para ${current.academicYear} (capacidade ${vacancies.capacity}, ocupadas ${vacancies.enrolled}, já prometidas ${vacancies.reserved}).`
        };
      }
    }

    const now = new Date().toISOString();
    const actor = this.currentActorName();
    const isDecision = DECISION_STATUSES.includes(to);
    const reopening = to === 'em_analise' && ['rejeitada', 'desistiu', 'lista_espera', 'avaliacao_agendada'].includes(current.status);

    this.db.admissions = (this.db.admissions || []).map((a) => {
      if (a.id !== id) return a;
      const next: Admission = {
        ...a,
        status: to,
        assessmentType,
        assessmentDate,
        updatedAt: now,
        updatedBy: actor,
        history: [
          ...(a.history || []),
          {
            at: now,
            by: actor,
            text: `${ADMISSION_STATUS_META[a.status].label} → ${ADMISSION_STATUS_META[to].label}${reason ? ` — ${reason}` : ''}`
          }
        ]
      };
      if (isDecision) {
        next.decidedBy = actor;
        next.decidedAt = now;
        next.decisionNotes = reason || undefined;
      } else if (reopening) {
        next.decidedBy = undefined;
        next.decidedAt = undefined;
        next.decisionNotes = undefined;
      }
      return next;
    });

    this.addAuditLog({
      userName: actor,
      userRole: 'Secretaria',
      action: 'Decisão de Admissão',
      details: `Candidatura ${current.code} (${current.name}): ${ADMISSION_STATUS_META[current.status].label} → ${ADMISSION_STATUS_META[to].label}${reason ? ` — ${reason}` : ''}.`,
      module: 'alunos',
      timestamp: 'Agora mesmo',
      badgeColor: to === 'rejeitada' ? '#7a0c0c' : '#0b1f3a'
    });
    this.notify();
    return { success: true };
  }

  /**
   * Cria a ficha do Aluno (estado "pendente") a partir de uma candidatura
   * aprovada. Turma, curso, propina e situação financeira ficam vazios de
   * propósito: pertencem à Matrícula, que é o passo seguinte.
   */
  public convertAdmissionToStudent(id: string): { success: boolean; error?: string; student?: Student } {
    const adm = (this.db.admissions || []).find((a) => a.id === id);
    if (!adm) return { success: false, error: 'Candidatura não encontrada.' };
    if (adm.status !== 'aprovada') {
      return { success: false, error: 'Só candidaturas aprovadas podem ser convertidas em aluno.' };
    }
    const dup = findDuplicateStudent(this.db.students || [], adm);
    if (dup) {
      return { success: false, error: `${dup.name} já está cadastrado(a) como aluno (nº ${dup.procNumber}). Confirme os dados antes de converter.` };
    }

    const payload = admissionToStudentPayload(adm);
    const delivered = (key: string) => (adm.documents || []).some((d) => d.key === key && d.delivered);
    const student = this.addStudent({
      ...payload,
      email: payload.email,
      classId: '',
      className: '',
      section: '',
      cycle: '',
      grade: '',
      monthlyTuitionKz: 0,
      financialStatus: 'regular',
      docBiCopy: delivered('bi_candidato') ? 'Entregue' : 'Pendente',
      docCertificate: delivered('certificado') ? 'Entregue' : 'Pendente',
      additionalDocs: [],
      status: 'pending',
      unexcusedAbsences: 0,
      excusedAbsences: 0,
      isTuitionPaidCurrentMonth: true,
      disciplineGrades: []
    } as any);

    const now = new Date().toISOString();
    const actor = this.currentActorName();
    this.db.admissions = (this.db.admissions || []).map((a) =>
      a.id === id
        ? {
            ...a,
            status: 'convertida' as AdmissionStatus,
            studentId: student.id,
            convertedAt: now,
            convertedBy: actor,
            updatedAt: now,
            updatedBy: actor,
            history: [
              ...(a.history || []),
              { at: now, by: actor, text: `Convertida em aluno — ficha criada (nº ${student.procNumber}).` }
            ]
          }
        : a
    );
    this.addAuditLog({
      userName: actor,
      userRole: 'Secretaria',
      action: 'Admissão Convertida em Aluno',
      details: `Candidatura ${adm.code} convertida na ficha de ${student.name} (nº ${student.procNumber}); segue para Matrículas.`,
      module: 'alunos',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true, student };
  }

  public deleteAdmission(id: string): { success: boolean; error?: string } {
    const current = (this.db.admissions || []).find((a) => a.id === id);
    if (!current) return { success: false, error: 'Candidatura não encontrada.' };
    if (current.status === 'convertida') {
      return { success: false, error: 'Uma candidatura convertida em aluno não pode ser eliminada (faz parte do histórico do aluno).' };
    }
    void this.unpublishAdmissionStatus(current);
    this.db.admissions = (this.db.admissions || []).filter((a) => a.id !== id);
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: 'Secretaria',
      action: 'Candidatura Eliminada',
      details: `Candidatura ${current.code} (${current.name}) eliminada.`,
      module: 'alunos',
      timestamp: 'Agora mesmo',
      badgeColor: '#7a0c0c'
    });
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Serviços 6 — Banco de Questões / Exames
  //
  // `access` traz o que o UTILIZADOR PODE FAZER (vem da matriz de permissões,
  // lida na vista). A base de dados só garante as regras que não dependem do
  // perfil: só o autor (ou quem gere tudo) edita, aprovar exige `canApprove`,
  // provas publicadas ficam congeladas.
  // ------------------------------------------------------------------
  public getQuestions(): ExamQuestion[] {
    return this.db.questions || [];
  }

  public getExamPapers(): ExamPaper[] {
    return this.db.examPapers || [];
  }

  public addQuestion(
    input: Omit<
      ExamQuestion,
      'id' | 'code' | 'status' | 'authorId' | 'authorName' | 'createdAt' | 'updatedAt' | 'approvedBy' | 'approvedAt'
    >,
    access: { canApprove: boolean; approveNow?: boolean }
  ): { success: boolean; error?: string; errors?: string[]; question?: ExamQuestion } {
    const normalized = normalizeQuestionFields(input);
    const errors = validateQuestion(normalized);
    if (errors.length > 0) return { success: false, error: errors[0], errors };

    const now = new Date().toISOString();
    const actor = this.db.currentUser;
    const approve = !!access.approveNow && access.canApprove;
    const created: ExamQuestion = {
      ...normalized,
      id: `qst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateQuestionCode((this.db.questions || []).map((q) => q.code)),
      status: approve ? 'aprovada' : 'rascunho',
      authorId: actor?.id || '',
      authorName: this.currentActorName(),
      createdAt: now,
      approvedBy: approve ? this.currentActorName() : undefined,
      approvedAt: approve ? now : undefined
    };
    this.db.questions = [created, ...(this.db.questions || [])];
    this.notify();
    return { success: true, question: created };
  }

  public updateQuestion(
    id: string,
    input: Omit<
      ExamQuestion,
      'id' | 'code' | 'status' | 'authorId' | 'authorName' | 'createdAt' | 'updatedAt' | 'approvedBy' | 'approvedAt'
    >,
    access: { canManageAll: boolean; canApprove: boolean }
  ): { success: boolean; error?: string; errors?: string[] } {
    const current = (this.db.questions || []).find((q) => q.id === id);
    if (!current) return { success: false, error: 'Questão não encontrada.' };
    if (current.authorId !== this.db.currentUser?.id && !access.canManageAll) {
      return { success: false, error: 'Só o autor da questão (ou a Direção) a pode editar.' };
    }
    const normalized = normalizeQuestionFields(input);
    const errors = validateQuestion(normalized);
    if (errors.length > 0) return { success: false, error: errors[0], errors };

    // Uma questão aprovada que o autor volta a editar deixa de estar aprovada:
    // a versão nova ainda ninguém a reviu.
    const loseApproval = current.status === 'aprovada' && !access.canApprove;
    this.db.questions = (this.db.questions || []).map((q) =>
      q.id === id
        ? {
            ...q,
            ...normalized,
            status: loseApproval ? 'rascunho' : q.status,
            approvedBy: loseApproval ? undefined : q.approvedBy,
            approvedAt: loseApproval ? undefined : q.approvedAt,
            updatedAt: new Date().toISOString()
          }
        : q
    );
    this.notify();
    return { success: true };
  }

  public setQuestionStatus(
    id: string,
    status: QuestionStatus,
    access: { canManageAll: boolean; canApprove: boolean }
  ): { success: boolean; error?: string } {
    const current = (this.db.questions || []).find((q) => q.id === id);
    if (!current) return { success: false, error: 'Questão não encontrada.' };
    const isAuthor = current.authorId === this.db.currentUser?.id;
    if (status === 'aprovada') {
      if (!access.canApprove) return { success: false, error: 'Não tem permissão para aprovar questões.' };
      const errors = validateQuestion(current as any);
      if (errors.length > 0) return { success: false, error: errors[0] };
    } else if (!isAuthor && !access.canManageAll) {
      return { success: false, error: 'Só o autor da questão (ou a Direção) altera o seu estado.' };
    }
    const now = new Date().toISOString();
    const approving = status === 'aprovada';
    this.db.questions = (this.db.questions || []).map((q) =>
      q.id === id
        ? {
            ...q,
            status,
            updatedAt: now,
            approvedBy: approving ? this.currentActorName() : status === 'rascunho' ? undefined : q.approvedBy,
            approvedAt: approving ? now : status === 'rascunho' ? undefined : q.approvedAt
          }
        : q
    );
    this.notify();
    return { success: true };
  }

  public duplicateQuestion(id: string): { success: boolean; error?: string; question?: ExamQuestion } {
    const current = (this.db.questions || []).find((q) => q.id === id);
    if (!current) return { success: false, error: 'Questão não encontrada.' };
    const now = new Date().toISOString();
    const copy: ExamQuestion = {
      ...current,
      options: current.options?.map((o) => ({ ...o })),
      id: `qst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateQuestionCode((this.db.questions || []).map((q) => q.code)),
      status: 'rascunho',
      authorId: this.db.currentUser?.id || '',
      authorName: this.currentActorName(),
      createdAt: now,
      updatedAt: undefined,
      approvedBy: undefined,
      approvedAt: undefined
    };
    this.db.questions = [copy, ...(this.db.questions || [])];
    this.notify();
    return { success: true, question: copy };
  }

  public deleteQuestion(id: string, access: { canManageAll: boolean }): { success: boolean; error?: string } {
    const current = (this.db.questions || []).find((q) => q.id === id);
    if (!current) return { success: false, error: 'Questão não encontrada.' };
    if (current.authorId !== this.db.currentUser?.id && !access.canManageAll) {
      return { success: false, error: 'Só o autor da questão (ou a Direção) a pode eliminar.' };
    }
    const usage = countQuestionUsage(id, this.db.examPapers || []);
    if (usage > 0) {
      return {
        success: false,
        error: `Esta questão está em ${usage} prova(s). Arquive-a em vez de a eliminar — as provas publicadas mantêm a sua cópia.`
      };
    }
    this.db.questions = (this.db.questions || []).filter((q) => q.id !== id);
    this.notify();
    return { success: true };
  }

  public saveExamPaper(
    input: {
      id?: string;
      title: string;
      subjectName: string;
      grade: string;
      type: ExamPaperType;
      academicYear: string;
      trimester: '1' | '2' | '3';
      examDate?: string;
      durationMinutes: number;
      targetPoints: number;
      instructions?: string;
      items: ExamPaperItem[];
    },
    access: { canManageAll: boolean }
  ): { success: boolean; error?: string; paper?: ExamPaper } {
    const title = input.title.trim();
    if (!title) return { success: false, error: 'Indique o título da prova.' };
    if (!input.subjectName.trim() || !input.grade.trim()) {
      return { success: false, error: 'Indique a disciplina e a classe da prova.' };
    }
    if (!Number.isFinite(input.targetPoints) || input.targetPoints <= 0) {
      return { success: false, error: 'A cotação total da prova deve ser superior a 0.' };
    }
    const seen = new Set<string>();
    const items: ExamPaperItem[] = [];
    for (const item of input.items) {
      if (seen.has(item.questionId)) continue;
      seen.add(item.questionId);
      items.push({ questionId: item.questionId, points: Number(item.points) || 0 });
    }

    const now = new Date().toISOString();
    const fields = {
      title,
      subjectName: input.subjectName.trim(),
      grade: input.grade.trim(),
      type: input.type,
      academicYear: input.academicYear,
      trimester: input.trimester || '1',
      examDate: input.examDate || undefined,
      durationMinutes: Number(input.durationMinutes) || 0,
      targetPoints: input.targetPoints,
      instructions: (input.instructions || '').trim() || undefined,
      items
    };

    if (input.id) {
      const current = (this.db.examPapers || []).find((p) => p.id === input.id);
      if (!current) return { success: false, error: 'Prova não encontrada.' };
      if (current.status !== 'rascunho') {
        return { success: false, error: 'Uma prova publicada não se edita — duplique-a para criar uma nova versão.' };
      }
      if (current.authorId !== this.db.currentUser?.id && !access.canManageAll) {
        return { success: false, error: 'Só o autor da prova (ou a Direção) a pode editar.' };
      }
      const updated: ExamPaper = { ...current, ...fields, updatedAt: now };
      this.db.examPapers = (this.db.examPapers || []).map((p) => (p.id === input.id ? updated : p));
      this.notify();
      return { success: true, paper: updated };
    }

    const created: ExamPaper = {
      ...fields,
      id: `prv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateExamPaperCode(input.academicYear, (this.db.examPapers || []).map((p) => p.code)),
      status: 'rascunho',
      authorId: this.db.currentUser?.id || '',
      authorName: this.currentActorName(),
      createdAt: now
    };
    this.db.examPapers = [created, ...(this.db.examPapers || [])];
    this.notify();
    return { success: true, paper: created };
  }

  public publishExamPaper(
    id: string,
    access: { canManageAll: boolean; canApprove: boolean }
  ): { success: boolean; error?: string; problems?: string[] } {
    const paper = (this.db.examPapers || []).find((p) => p.id === id);
    if (!paper) return { success: false, error: 'Prova não encontrada.' };
    if (paper.status !== 'rascunho') return { success: false, error: 'Esta prova já foi publicada.' };
    if (paper.authorId !== this.db.currentUser?.id && !access.canManageAll) {
      return { success: false, error: 'Só o autor da prova (ou a Direção) a pode publicar.' };
    }
    if (paperTypeNeedsApproval(paper.type) && !access.canApprove) {
      return {
        success: false,
        error: 'Exames finais, de recurso e de acesso só podem ser publicados pela Direção / Administração.'
      };
    }
    const byId = new Map((this.db.questions || []).map((q) => [q.id, q]));
    const problems = validatePaperForPublish(paper, byId);
    if (problems.length > 0) return { success: false, error: problems[0], problems };

    const now = new Date().toISOString();
    this.db.examPapers = (this.db.examPapers || []).map((p) =>
      p.id === id
        ? {
            ...p,
            status: 'publicada' as const,
            publishedAt: now,
            publishedBy: this.currentActorName(),
            updatedAt: now,
            // Cópia congelada: editar o banco depois não altera esta prova.
            items: p.items.map((i) => ({ ...i, snapshot: JSON.parse(JSON.stringify(byId.get(i.questionId))) }))
          }
        : p
    );
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: 'Docente',
      action: 'Prova Publicada',
      details: `Prova ${paper.code} — ${paper.title} (${paper.subjectName}, ${paper.grade}) publicada com ${sumPoints(paper.items)} valores.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true };
  }

  public archiveExamPaper(id: string, access: { canManageAll: boolean }): { success: boolean; error?: string } {
    const paper = (this.db.examPapers || []).find((p) => p.id === id);
    if (!paper) return { success: false, error: 'Prova não encontrada.' };
    if (paper.authorId !== this.db.currentUser?.id && !access.canManageAll) {
      return { success: false, error: 'Só o autor da prova (ou a Direção) a pode arquivar.' };
    }
    this.db.examPapers = (this.db.examPapers || []).map((p) =>
      p.id === id ? { ...p, status: 'arquivada' as const, updatedAt: new Date().toISOString() } : p
    );
    this.notify();
    return { success: true };
  }

  /** Cria um novo rascunho com as mesmas questões (versões atuais do banco). */
  public duplicateExamPaper(id: string): { success: boolean; error?: string; paper?: ExamPaper } {
    const paper = (this.db.examPapers || []).find((p) => p.id === id);
    if (!paper) return { success: false, error: 'Prova não encontrada.' };
    const now = new Date().toISOString();
    const copy: ExamPaper = {
      ...paper,
      id: `prv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateExamPaperCode(paper.academicYear, (this.db.examPapers || []).map((p) => p.code)),
      title: `${paper.title} (cópia)`,
      status: 'rascunho',
      items: paper.items.map((i) => ({ questionId: i.questionId, points: i.points })),
      authorId: this.db.currentUser?.id || '',
      authorName: this.currentActorName(),
      createdAt: now,
      updatedAt: undefined,
      publishedAt: undefined,
      publishedBy: undefined
    };
    this.db.examPapers = [copy, ...(this.db.examPapers || [])];
    this.notify();
    return { success: true, paper: copy };
  }

  public deleteExamPaper(id: string, access: { canManageAll: boolean }): { success: boolean; error?: string } {
    const paper = (this.db.examPapers || []).find((p) => p.id === id);
    if (!paper) return { success: false, error: 'Prova não encontrada.' };
    if (paper.status === 'publicada') {
      return { success: false, error: 'Uma prova publicada não se elimina — arquive-a.' };
    }
    if (paper.authorId !== this.db.currentUser?.id && !access.canManageAll) {
      return { success: false, error: 'Só o autor da prova (ou a Direção) a pode eliminar.' };
    }
    this.db.examPapers = (this.db.examPapers || []).filter((p) => p.id !== id);
    this.notify();
    return { success: true };
  }

  // =========================================================================
  // SERVIÇOS → 7. PLANO CURRICULAR & CONTEÚDOS
  // =========================================================================

  public getCurriculumPlans(): CurriculumPlan[] {
    return this.db.curriculumPlans || [];
  }

  public saveCurriculumPlan(
    input: { id?: string } & Parameters<typeof normalizePlanFields>[0]
  ): { success: boolean; error?: string; errors?: string[]; plan?: CurriculumPlan } {
    const fields = normalizePlanFields(input);
    const errors = validatePlan(fields);
    const dup = findDuplicatePlan(this.db.curriculumPlans || [], fields, input.id);
    if (dup) errors.push(`Já existe um plano ativo (${dup.code}) para ${fields.subjectName} em ${fields.grade} nesse ano letivo.`);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    if (input.id) {
      const current = (this.db.curriculumPlans || []).find((p) => p.id === input.id);
      if (!current) return { success: false, error: 'Plano não encontrado.' };
      if (current.status !== 'rascunho') {
        return { success: false, error: 'Só um plano em Rascunho pode ter a estrutura editada. Reabra-o primeiro.' };
      }
      const updated: CurriculumPlan = { ...current, ...fields, updatedAt: now, updatedBy: this.currentActorName() };
      this.db.curriculumPlans = (this.db.curriculumPlans || []).map((p) => (p.id === input.id ? updated : p));
      this.notify();
      return { success: true, plan: updated };
    }

    const created: CurriculumPlan = {
      ...fields,
      id: `plc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generatePlanCode(fields.academicYear, (this.db.curriculumPlans || []).map((p) => p.code)),
      status: 'rascunho',
      authorId: this.db.currentUser?.id || '',
      authorName: this.currentActorName(),
      createdAt: now
    };
    this.db.curriculumPlans = [created, ...(this.db.curriculumPlans || [])];
    this.notify();
    return { success: true, plan: created };
  }

  public approveCurriculumPlan(id: string): { success: boolean; error?: string; errors?: string[] } {
    const plan = (this.db.curriculumPlans || []).find((p) => p.id === id);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    if (plan.status !== 'rascunho') return { success: false, error: 'Só um plano em Rascunho pode ser aprovado.' };
    const errors = validatePlanForApproval(plan);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    this.db.curriculumPlans = (this.db.curriculumPlans || []).map((p) =>
      p.id === id ? { ...p, status: 'aprovado' as const, approvedBy: this.currentActorName(), approvedAt: now, updatedAt: now } : p
    );
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: 'Direção',
      action: 'Plano Curricular Aprovado',
      details: `Plano ${plan.code} — ${plan.subjectName} (${plan.grade}, ${plan.academicYear}) aprovado.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true };
  }

  /** Devolve o plano a Rascunho: mantém o que já foi leccionado, mas exige nova aprovação. */
  public reopenCurriculumPlan(id: string): { success: boolean; error?: string } {
    const plan = (this.db.curriculumPlans || []).find((p) => p.id === id);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    if (plan.status !== 'aprovado') return { success: false, error: 'Só um plano Aprovado pode ser reaberto.' };
    this.db.curriculumPlans = (this.db.curriculumPlans || []).map((p) =>
      p.id === id
        ? { ...p, status: 'rascunho' as const, approvedBy: undefined, approvedAt: undefined, updatedAt: new Date().toISOString() }
        : p
    );
    this.notify();
    return { success: true };
  }

  public archiveCurriculumPlan(id: string): { success: boolean; error?: string } {
    const plan = (this.db.curriculumPlans || []).find((p) => p.id === id);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    this.db.curriculumPlans = (this.db.curriculumPlans || []).map((p) =>
      p.id === id ? { ...p, status: 'arquivado' as const, updatedAt: new Date().toISOString() } : p
    );
    this.notify();
    return { success: true };
  }

  public deleteCurriculumPlan(id: string): { success: boolean; error?: string } {
    const plan = (this.db.curriculumPlans || []).find((p) => p.id === id);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    if (plan.status !== 'rascunho') return { success: false, error: 'Só um plano em Rascunho pode ser eliminado — arquive os restantes.' };
    this.db.curriculumPlans = (this.db.curriculumPlans || []).filter((p) => p.id !== id);
    this.notify();
    return { success: true };
  }

  /** Regista o progresso leccionado de uma unidade (só com o plano Aprovado). */
  public registerUnitProgress(
    planId: string,
    unitId: string,
    fields: { deliveredLessons: number; notes?: string; completedAt?: string }
  ): { success: boolean; error?: string; plan?: CurriculumPlan } {
    const plan = (this.db.curriculumPlans || []).find((p) => p.id === planId);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    if (plan.status !== 'aprovado') return { success: false, error: 'Só se regista progresso num plano Aprovado.' };
    const unit = plan.units.find((u) => u.id === unitId);
    if (!unit) return { success: false, error: 'Unidade não encontrada.' };
    const delivered = Math.max(0, Math.floor(Number(fields.deliveredLessons) || 0));
    if (delivered > unit.plannedLessons) {
      return { success: false, error: `Os tempos leccionados (${delivered}) excedem os previstos (${unit.plannedLessons}).` };
    }
    const now = new Date().toISOString();
    const updatedUnit: CurriculumUnit = {
      ...unit,
      deliveredLessons: delivered,
      notes: fields.notes !== undefined ? fields.notes || undefined : unit.notes,
      completedAt: delivered >= unit.plannedLessons && unit.plannedLessons > 0 ? fields.completedAt || now : undefined
    };
    const updated: CurriculumPlan = {
      ...plan,
      units: plan.units.map((u) => (u.id === unitId ? updatedUnit : u)),
      updatedAt: now,
      updatedBy: this.currentActorName()
    };
    this.db.curriculumPlans = (this.db.curriculumPlans || []).map((p) => (p.id === planId ? updated : p));
    this.notify();
    return { success: true, plan: updated };
  }

  /** Cópia da estrutura de um plano para outra classe / ano letivo. */
  public clonePlanTo(
    id: string,
    target: { academicYear: string; grade: string }
  ): { success: boolean; error?: string; errors?: string[]; plan?: CurriculumPlan } {
    const plan = (this.db.curriculumPlans || []).find((p) => p.id === id);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    return this.saveCurriculumPlan(clonePlanInput(plan, target) as any);
  }

  // =========================================================================
  // SERVIÇOS → 8. ATIVIDADES EXTRACURRICULARES
  // =========================================================================

  public getExtracurricularActivities(): ExtracurricularActivity[] {
    return this.db.extracurricularActivities || [];
  }

  public saveExtracurricularActivity(
    input: { id?: string } & Parameters<typeof normalizeActivityFields>[0]
  ): { success: boolean; error?: string; errors?: string[]; activity?: ExtracurricularActivity } {
    const fields = normalizeActivityFields(input);
    const errors = validateActivity(fields);
    const others = this.db.extracurricularActivities || [];
    const conflicts = findResourceConflicts(fields, others, input.id);
    if (conflicts.length > 0) {
      errors.push(`O local ou o coordenador já estão ocupados nesse horário por outra atividade (${conflicts[0].other.code}).`);
    }
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    if (input.id) {
      const current = others.find((a) => a.id === input.id);
      if (!current) return { success: false, error: 'Atividade não encontrada.' };
      if (fields.capacity < activeEnrollments(current).length) {
        return { success: false, error: `Já há ${activeEnrollments(current).length} inscritos ativos — a capacidade não pode ser menor.` };
      }
      const updated: ExtracurricularActivity = { ...current, ...fields, updatedAt: now, updatedBy: this.currentActorName() };
      this.db.extracurricularActivities = others.map((a) => (a.id === input.id ? updated : a));
      this.notify();
      return { success: true, activity: updated };
    }

    const created: ExtracurricularActivity = {
      ...fields,
      id: `atv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateActivityCode(fields.academicYear, others.map((a) => a.code)),
      status: 'planeada',
      enrollments: [],
      sessions: [],
      createdAt: now,
      createdBy: this.currentActorName()
    };
    this.db.extracurricularActivities = [created, ...others];
    this.notify();
    return { success: true, activity: created };
  }

  public changeActivityStatus(id: string, to: ActivityStatus): { success: boolean; error?: string } {
    const activity = (this.db.extracurricularActivities || []).find((a) => a.id === id);
    if (!activity) return { success: false, error: 'Atividade não encontrada.' };
    if (!canTransitionActivity(activity.status, to)) {
      return { success: false, error: `Não é possível passar de «${activity.status}» para «${to}».` };
    }
    const now = new Date().toISOString();
    this.db.extracurricularActivities = (this.db.extracurricularActivities || []).map((a) =>
      a.id === id ? { ...a, status: to, updatedAt: now, updatedBy: this.currentActorName() } : a
    );
    this.notify();
    return { success: true };
  }

  public deleteExtracurricularActivity(id: string): { success: boolean; error?: string } {
    const activity = (this.db.extracurricularActivities || []).find((a) => a.id === id);
    if (!activity) return { success: false, error: 'Atividade não encontrada.' };
    if ((activity.enrollments || []).length > 0) {
      return { success: false, error: 'Esta atividade já tem inscrições — cancele-a em vez de a eliminar.' };
    }
    this.db.extracurricularActivities = (this.db.extracurricularActivities || []).filter((a) => a.id !== id);
    this.notify();
    return { success: true };
  }

  public enrollStudentInActivity(
    activityId: string,
    studentId: string,
    opts: { guardianAuthorized: boolean }
  ): { success: boolean; error?: string; errors?: string[]; warnings?: string[]; waitlisted?: boolean } {
    const activity = (this.db.extracurricularActivities || []).find((a) => a.id === activityId);
    if (!activity) return { success: false, error: 'Atividade não encontrada.' };
    const student = (this.db.students || []).find((s) => s.id === studentId);
    const check = checkEnrollment(activity, student, { activities: this.db.extracurricularActivities || [], timetable: this.db.timetable });
    if (check.errors.length > 0) return { success: false, errors: check.errors, error: check.errors[0], warnings: check.warnings };
    if (!opts.guardianAuthorized) {
      return { success: false, error: 'É obrigatória a autorização do encarregado de educação.' };
    }

    const now = new Date().toISOString();
    const enrollment: ActivityEnrollment = {
      id: `enr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: student!.id,
      studentName: student!.name,
      studentProcNumber: student!.procNumber,
      className: student!.className,
      grade: student!.grade,
      status: check.waitlisted ? 'lista_espera' : 'ativa',
      enrolledAt: now,
      guardianAuthorized: true
    };
    this.db.extracurricularActivities = (this.db.extracurricularActivities || []).map((a) =>
      a.id === activityId ? { ...a, enrollments: [...(a.enrollments || []), enrollment] } : a
    );
    this.notify();
    return { success: true, waitlisted: check.waitlisted, warnings: check.warnings };
  }

  /** Cancela a inscrição; se estava ativa e havia lista de espera, promove o primeiro da fila. */
  public cancelActivityEnrollment(
    activityId: string,
    enrollmentId: string,
    reason?: string
  ): { success: boolean; error?: string; promoted?: string } {
    const activity = (this.db.extracurricularActivities || []).find((a) => a.id === activityId);
    if (!activity) return { success: false, error: 'Atividade não encontrada.' };
    const enrollment = (activity.enrollments || []).find((e) => e.id === enrollmentId);
    if (!enrollment) return { success: false, error: 'Inscrição não encontrada.' };
    if (enrollment.status === 'cancelada') return { success: false, error: 'Esta inscrição já está cancelada.' };

    const wasActive = enrollment.status === 'ativa';
    const now = new Date().toISOString();
    let enrollments = (activity.enrollments || []).map((e) =>
      e.id === enrollmentId ? { ...e, status: 'cancelada' as const, cancelledAt: now, cancelledReason: reason || undefined } : e
    );
    let promoted = '';
    if (wasActive) {
      const nextInLine = waitlist({ ...activity, enrollments }).find((e) => e.id !== enrollmentId);
      if (nextInLine) {
        enrollments = enrollments.map((e) => (e.id === nextInLine.id ? { ...e, status: 'ativa' as const } : e));
        promoted = nextInLine.studentName;
      }
    }
    this.db.extracurricularActivities = (this.db.extracurricularActivities || []).map((a) =>
      a.id === activityId ? { ...a, enrollments } : a
    );
    this.notify();
    return { success: true, promoted: promoted || undefined };
  }

  public saveActivitySession(
    activityId: string,
    input: { id?: string; date: string; notes?: string; entries: ActivityAttendanceEntry[] }
  ): { success: boolean; error?: string; errors?: string[]; session?: ActivitySession } {
    const activity = (this.db.extracurricularActivities || []).find((a) => a.id === activityId);
    if (!activity) return { success: false, error: 'Atividade não encontrada.' };
    const todayIso = new Date().toISOString().slice(0, 10);
    const errors = validateSessionDate(activity, input.date, todayIso, input.id);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    if (input.id) {
      const current = (activity.sessions || []).find((s) => s.id === input.id);
      if (!current) return { success: false, error: 'Sessão não encontrada.' };
      const updated: ActivitySession = {
        ...current,
        date: input.date,
        notes: input.notes || undefined,
        entries: input.entries,
        updatedAt: now,
        updatedBy: this.currentActorName()
      };
      this.db.extracurricularActivities = (this.db.extracurricularActivities || []).map((a) =>
        a.id === activityId ? { ...a, sessions: (a.sessions || []).map((s) => (s.id === input.id ? updated : s)) } : a
      );
      this.notify();
      return { success: true, session: updated };
    }

    const created: ActivitySession = {
      id: `ses-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: input.date,
      notes: input.notes || undefined,
      entries: input.entries,
      createdAt: now,
      createdBy: this.currentActorName()
    };
    this.db.extracurricularActivities = (this.db.extracurricularActivities || []).map((a) =>
      a.id === activityId ? { ...a, sessions: [created, ...(a.sessions || [])] } : a
    );
    this.notify();
    return { success: true, session: created };
  }

  public deleteActivitySession(activityId: string, sessionId: string): { success: boolean; error?: string } {
    const activity = (this.db.extracurricularActivities || []).find((a) => a.id === activityId);
    if (!activity) return { success: false, error: 'Atividade não encontrada.' };
    this.db.extracurricularActivities = (this.db.extracurricularActivities || []).map((a) =>
      a.id === activityId ? { ...a, sessions: (a.sessions || []).filter((s) => s.id !== sessionId) } : a
    );
    this.notify();
    return { success: true };
  }

  // =========================================================================
  // SERVIÇOS → 9. REFEITÓRIO
  // =========================================================================

  public getCanteenMenus(): CanteenMenu[] {
    return this.db.canteenMenus || [];
  }

  public getCanteenSubscriptions(): CanteenSubscription[] {
    return this.db.canteenSubscriptions || [];
  }

  public getCanteenServiceRecords(): CanteenServiceRecord[] {
    return this.db.canteenServices || [];
  }

  public saveCanteenMenu(
    input: { id?: string } & Parameters<typeof normalizeMenuFields>[0]
  ): { success: boolean; error?: string; errors?: string[]; menu?: CanteenMenu } {
    const fields = normalizeMenuFields(input);
    const errors = validateMenu(fields, this.db.canteenMenus || [], input.id);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    if (input.id) {
      const current = (this.db.canteenMenus || []).find((m) => m.id === input.id);
      if (!current) return { success: false, error: 'Ementa não encontrada.' };
      const updated: CanteenMenu = { ...current, ...fields, updatedAt: now, updatedBy: this.currentActorName() };
      this.db.canteenMenus = (this.db.canteenMenus || []).map((m) => (m.id === input.id ? updated : m));
      this.notify();
      return { success: true, menu: updated };
    }

    const created: CanteenMenu = {
      ...fields,
      id: `mnu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.canteenMenus = [created, ...(this.db.canteenMenus || [])];
    this.notify();
    return { success: true, menu: created };
  }

  public deleteCanteenMenu(id: string): { success: boolean; error?: string } {
    const menu = (this.db.canteenMenus || []).find((m) => m.id === id);
    if (!menu) return { success: false, error: 'Ementa não encontrada.' };
    this.db.canteenMenus = (this.db.canteenMenus || []).filter((m) => m.id !== id);
    this.notify();
    return { success: true };
  }

  public saveCanteenSubscription(
    input: { id?: string } & Parameters<typeof normalizeSubscriptionFields>[0]
  ): { success: boolean; error?: string; errors?: string[]; subscription?: CanteenSubscription } {
    const fields = normalizeSubscriptionFields(input);
    const student = (this.db.students || []).find((s) => s.id === fields.studentId);
    const errors = validateSubscription(fields, student, this.db.canteenSubscriptions || [], input.id);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    if (input.id) {
      const current = (this.db.canteenSubscriptions || []).find((s) => s.id === input.id);
      if (!current) return { success: false, error: 'Inscrição não encontrada.' };
      const updated: CanteenSubscription = { ...current, ...fields, updatedAt: now, updatedBy: this.currentActorName() };
      this.db.canteenSubscriptions = (this.db.canteenSubscriptions || []).map((s) => (s.id === input.id ? updated : s));
      this.notify();
      return { success: true, subscription: updated };
    }

    const created: CanteenSubscription = {
      ...fields,
      id: `csb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: generateSubscriptionCode((this.db.canteenSubscriptions || []).map((s) => s.code)),
      studentName: student!.name,
      studentProcNumber: student!.procNumber,
      className: student!.className,
      status: 'ativa',
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.canteenSubscriptions = [created, ...(this.db.canteenSubscriptions || [])];
    this.notify();
    return { success: true, subscription: created };
  }

  public changeCanteenSubscriptionStatus(
    id: string,
    status: CanteenSubscription['status'],
    reason?: string
  ): { success: boolean; error?: string } {
    const sub = (this.db.canteenSubscriptions || []).find((s) => s.id === id);
    if (!sub) return { success: false, error: 'Inscrição não encontrada.' };
    this.db.canteenSubscriptions = (this.db.canteenSubscriptions || []).map((s) =>
      s.id === id
        ? { ...s, status, statusReason: reason || undefined, updatedAt: new Date().toISOString(), updatedBy: this.currentActorName() }
        : s
    );
    this.notify();
    return { success: true };
  }

  public deleteCanteenSubscription(id: string): { success: boolean; error?: string } {
    const sub = (this.db.canteenSubscriptions || []).find((s) => s.id === id);
    if (!sub) return { success: false, error: 'Inscrição não encontrada.' };
    this.db.canteenSubscriptions = (this.db.canteenSubscriptions || []).filter((s) => s.id !== id);
    this.notify();
    return { success: true };
  }

  /** Cria ou atualiza (nunca duplica) o registo de serviço de uma data/refeição. */
  public saveCanteenServiceRecord(
    date: string,
    mealType: MealType,
    entries: CanteenServiceEntry[]
  ): { success: boolean; error?: string; errors?: string[]; record?: CanteenServiceRecord } {
    const todayIso = new Date().toISOString().slice(0, 10);
    const errors = validateServiceRecord(date, mealType, entries, todayIso);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const now = new Date().toISOString();
    const existing = findServiceRecord(this.db.canteenServices || [], date, mealType);
    if (existing) {
      const updated: CanteenServiceRecord = { ...existing, entries, updatedAt: now, updatedBy: this.currentActorName() };
      this.db.canteenServices = (this.db.canteenServices || []).map((r) => (r.id === existing.id ? updated : r));
      this.notify();
      return { success: true, record: updated };
    }
    const created: CanteenServiceRecord = {
      id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      mealType,
      entries,
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.canteenServices = [created, ...(this.db.canteenServices || [])];
    this.notify();
    return { success: true, record: created };
  }

  public clearStudents() {
    this.db.students = [];
    this.syncClassStudentCounts();
    this.notify();
  }

  public clearTeachers() {
    this.db.teachers = [];
    this.notify();
  }

  public clearClasses() {
    this.db.classes = [];
    this.notify();
  }

  public clearSubjects() {
    this.db.subjects = [];
    this.notify();
  }

  public clearCourses() {
    this.db.courses = [];
    this.notify();
  }

  // Classes CRUD
  public addClass(classItem: Omit<ClassRoom, 'id'>): ClassRoom {
    const newClass: ClassRoom = {
      ...classItem,
      id: `turma-${Date.now()}`
    };
    this.db.classes = [...this.db.classes, newClass];
    this.syncClassStudentCounts();
    this.notify();
    return newClass;
  }

  public updateClass(id: string, updates: Partial<ClassRoom>) {
    this.db.classes = this.db.classes.map((c) => (c.id === id ? { ...c, ...updates } : c));
    this.syncClassStudentCounts();
    this.notify();
  }

  public deleteClass(id: string): { success: boolean; error?: string } {
    const enrolledStudents = (this.db.students || []).filter(
      (s) => String(s.classId) === String(id)
    );
    if (enrolledStudents.length > 0) {
      return {
        success: false,
        error: `A turma possui ${enrolledStudents.length} aluno(s) matriculado(s) ativo(s) no sistema. Transfira os alunos para outra turma antes de eliminar.`
      };
    }
    this.db.classes = this.db.classes.filter((c) => c.id !== id);
    this.notify();
    return { success: true };
  }

  // Subjects CRUD
  public addSubject(subject: Omit<Subject, 'id'>): Subject {
    const newSubject: Subject = {
      ...subject,
      id: `sub-${Date.now()}`
    };
    this.db.subjects = [...(this.db.subjects || defaultSubjects), newSubject];
    this.notify();
    return newSubject;
  }

  public updateSubject(id: string, updates: Partial<Subject>) {
    this.db.subjects = (this.db.subjects || defaultSubjects).map((s) => (s.id === id ? { ...s, ...updates } : s));
    this.notify();
  }

  public deleteSubject(id: string) {
    this.db.subjects = (this.db.subjects || defaultSubjects).filter((s) => s.id !== id);
    this.notify();
  }

  // Courses CRUD
  public addCourse(course: Omit<Course, 'id'>): Course {
    const newCourse: Course = {
      ...course,
      id: `crs-${Date.now()}`
    };
    this.db.courses = [...(this.db.courses || defaultCourses), newCourse];
    this.notify();
    return newCourse;
  }

  public updateCourse(id: string, updates: Partial<Course>) {
    this.db.courses = (this.db.courses || defaultCourses).map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    this.notify();
  }

  public deleteCourse(id: string) {
    this.db.courses = (this.db.courses || defaultCourses).filter((c) => c.id !== id);
    this.notify();
  }

  // Timetable CRUD
  public getTimetableForClass(classId: string): TimetableEntry[] {
    return (this.db.timetable || []).filter((t) => String(t.classId) === String(classId));
  }

  public setTimetableForClass(classId: string, entries: Omit<TimetableEntry, 'id' | 'classId'>[]) {
    const others = (this.db.timetable || []).filter((t) => String(t.classId) !== String(classId));
    const newEntries: TimetableEntry[] = entries.map((e, idx) => ({
      ...e,
      id: `tt-${classId}-${Date.now()}-${idx}`,
      classId
    }));
    this.db.timetable = [...others, ...newEntries];
    this.notify();
  }

  /**
   * Verifica se já existe uma disciplina alocada no mesmo dia/tempo lectivo
   * para a mesma turma. Devolve a entrada conflituante (se existir), para que
   * a UI possa informar exactamente qual disciplina já ocupa aquele horário.
   * `excludeId` permite ignorar a própria entrada quando se está a editar.
   */
  public findTimetableConflict(
    classId: string,
    dayOfWeek: TimetableEntry['dayOfWeek'],
    timeStart: string,
    excludeId?: string
  ): TimetableEntry | undefined {
    const list = this.db.timetable || [];
    return list.find(
      (t) =>
        String(t.classId) === String(classId) &&
        t.dayOfWeek === dayOfWeek &&
        t.timeStart === timeStart &&
        t.id !== excludeId
    );
  }

  public saveTimetableEntry(entry: Omit<TimetableEntry, 'id'> & { id?: string }): TimetableEntry {
    const id = entry.id || `tt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Regra: não permitir alocar uma disciplina num horário (dia + tempo
    // lectivo) que já tem uma disciplina alocada para a mesma turma.
    const conflict = this.findTimetableConflict(entry.classId, entry.dayOfWeek, entry.timeStart, id);
    if (conflict) {
      throw new Error(
        `Já existe a disciplina "${conflict.subject}" alocada em ${conflict.dayOfWeek} às ${conflict.timeStart}. ` +
          `Remova ou altere essa alocação antes de definir uma nova disciplina neste horário.`
      );
    }

    const fullEntry: TimetableEntry = {
      id,
      classId: entry.classId,
      dayOfWeek: entry.dayOfWeek,
      timeStart: entry.timeStart,
      timeEnd: entry.timeEnd,
      subject: entry.subject,
      teacherName: entry.teacherName,
      room: entry.room
    };
    const list = this.db.timetable || [];
    const existsIndex = list.findIndex((t) => t.id === id);
    if (existsIndex >= 0) {
      const updated = [...list];
      updated[existsIndex] = fullEntry;
      this.db.timetable = updated;
    } else {
      this.db.timetable = [...list, fullEntry];
    }
    this.notify();
    return fullEntry;
  }

  public deleteTimetableEntry(id: string) {
    this.db.timetable = (this.db.timetable || []).filter((t) => t.id !== id);
    this.notify();
  }

  // Attendance
  public getAttendanceSheets(): AttendanceSheet[] {
    return this.db.attendanceSheets || [];
  }

  public getAttendanceSheet(classId: string, subjectId: string, date: string): AttendanceSheet | undefined {
    return (this.db.attendanceSheets || []).find(
      (s) => s.classId === classId && s.subjectId === subjectId && s.date === date
    );
  }

  public saveAttendanceSheet(sheet: AttendanceSheet): AttendanceSheet {
    const sheets = [...(this.db.attendanceSheets || [])];
    const existingIndex = sheets.findIndex(
      (s) => s.id === sheet.id || (s.classId === sheet.classId && s.subjectId === sheet.subjectId && s.date === sheet.date)
    );

    const updatedSheet: AttendanceSheet = {
      ...sheet,
      id: sheet.id || `att-${sheet.classId}-${sheet.subjectId}-${sheet.date}`
    };

    if (existingIndex >= 0) {
      sheets[existingIndex] = updatedSheet;
    } else {
      sheets.unshift(updatedSheet);
    }

    this.db.attendanceSheets = sheets;
    this.db.attendance = updatedSheet;
    this.recalculateStudentsAttendanceStats();
    this.notify();
    return updatedSheet;
  }

  public deleteAttendanceSheet(sheetId: string) {
    this.db.attendanceSheets = (this.db.attendanceSheets || []).filter((s) => s.id !== sheetId);
    if (this.db.attendance.id === sheetId && this.db.attendanceSheets.length > 0) {
      this.db.attendance = this.db.attendanceSheets[0];
    }
    this.recalculateStudentsAttendanceStats();
    this.notify();
  }

  public recalculateStudentsAttendanceStats() {
    const sheets = this.db.attendanceSheets || [];
    if (!sheets.length) return;

    this.db.students = (this.db.students || []).map((student) => {
      let totalSessions = 0;
      let unexcused = 0; // FI
      let excused = 0; // FJ
      let present = 0; // P
      let delay = 0; // A

      sheets.forEach((sheet) => {
        const item = sheet.students?.find((s) => String(s.studentId) === String(student.id));
        if (item) {
          totalSessions++;
          if (item.status === 'FI') unexcused++;
          else if (item.status === 'FJ') excused++;
          else if (item.status === 'P') present++;
          else if (item.status === 'A') delay++;
        }
      });

      if (totalSessions > 0) {
        const presenceCount = present + delay;
        const rate = Math.round((presenceCount / totalSessions) * 1000) / 10;
        return {
          ...student,
          unexcusedAbsences: unexcused,
          excusedAbsences: excused,
          attendanceRate: rate
        };
      }
      return student;
    });
  }

  public updateAttendanceItem(studentId: string, status: 'P' | 'FJ' | 'FI' | 'A', note?: string) {
    const student = this.db.attendance.students.find((s) => s.studentId === studentId);
    if (student) {
      student.status = status;
      if (note !== undefined) student.note = note;
      if (status === 'P') {
        student.entryTime = '08:30';
      } else if (status === 'A') {
        student.entryTime = '08:45';
      } else if (status === 'FI') {
        student.entryTime = 'FALTOU';
      } else {
        student.entryTime = '—';
      }
      // Also update in attendanceSheets if present
      if (this.db.attendanceSheets) {
        const currentSheetId = this.db.attendance.id;
        const sheet = this.db.attendanceSheets.find((s) => s.id === currentSheetId);
        if (sheet) {
          const sheetStudent = sheet.students?.find((s) => s.studentId === studentId);
          if (sheetStudent) {
            sheetStudent.status = status;
            if (note !== undefined) sheetStudent.note = note;
            sheetStudent.entryTime = student.entryTime;
          }
        }
      }
      this.recalculateStudentsAttendanceStats();
      this.notify();
    }
  }

  public markAllAttendance(status: 'P' | 'FJ' | 'FI' | 'A') {
    this.db.attendance.students = this.db.attendance.students.map((s) => ({
      ...s,
      status,
      entryTime: status === 'P' ? '08:30' : status === 'FI' ? 'FALTOU' : '—'
    }));

    if (this.db.attendanceSheets) {
      const currentSheetId = this.db.attendance.id;
      const sheet = this.db.attendanceSheets.find((s) => s.id === currentSheetId);
      if (sheet) {
        sheet.students = sheet.students.map((s) => ({
          ...s,
          status,
          entryTime: status === 'P' ? '08:30' : status === 'FI' ? 'FALTOU' : '—'
        }));
      }
    }
    this.recalculateStudentsAttendanceStats();
    this.notify();
  }

  public saveAttendanceLessonSummary(summary: string, isSigned: boolean) {
    this.db.attendance.lessonSummary = summary;
    this.db.attendance.isDigitallySigned = isSigned;
    if (isSigned) {
      this.db.attendance.signedBy = this.db.currentUser.name;
      this.db.attendance.signedAt = `${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} (IP 192.168.10.42)`;
      this.db.attendance.status = 'sincronizado';
    }
    if (this.db.attendanceSheets) {
      const currentSheetId = this.db.attendance.id;
      const sheet = this.db.attendanceSheets.find((s) => s.id === currentSheetId);
      if (sheet) {
        sheet.lessonSummary = summary;
        sheet.isDigitallySigned = isSigned;
        sheet.signedBy = this.db.attendance.signedBy;
        sheet.signedAt = this.db.attendance.signedAt;
        sheet.status = this.db.attendance.status;
      }
    }
    this.notify();
  }

  // Pauta & Grades
  public updateStudentGrade(gradeId: string, mac: number, npp: number, npt: number, note?: string) {
    const grade = this.db.pauta.grades.find((g) => g.id === gradeId);
    if (grade) {
      grade.mac = mac;
      grade.npp = npp;
      grade.npt = npt;
      // Formula: MT = (MAC * 0.3) + (NPP * 0.3) + (NPT * 0.4)
      const calculated = Math.round(((mac * 0.3) + (npp * 0.3) + (npt * 0.4)) * 10) / 10;
      grade.finalScore = calculated;

      if (calculated >= 18) grade.qualitative = 'Excelente';
      else if (calculated >= 16) grade.qualitative = 'Muito Bom';
      else if (calculated >= 14) grade.qualitative = 'Bom';
      else if (calculated >= 10) grade.qualitative = 'Suficiente';
      else grade.qualitative = 'Insuficiente';

      if (calculated >= 14) grade.situation = 'Transita (Dispensa)';
      else if (calculated >= 10) grade.situation = 'Transita';
      else if (calculated >= 7) grade.situation = 'Exame de Recurso';
      else grade.situation = 'Não Aprovado';

      if (note !== undefined) grade.teacherNote = note;

      // Recalculate pauta stats
      const totalScores = this.db.pauta.grades.map((g) => g.finalScore);
      const avg = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
      this.db.pauta.classAverage = Math.round(avg * 10) / 10;
      this.db.pauta.highestGrade = Math.max(...totalScores);
      this.db.pauta.lowestGrade = Math.min(...totalScores);
      const approved = this.db.pauta.grades.filter((g) => g.finalScore >= 9.5).length;
      this.db.pauta.approvedCount = approved;
      this.db.pauta.failedCount = this.db.pauta.grades.length - approved;
      this.db.pauta.approvalRatePercent = Math.round((approved / this.db.pauta.grades.length) * 1000) / 10;
      this.db.pauta.lastUpdated = `${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;

      this.notify();
    }
  }

  /**
   * Marca a pauta geral (ecrã de Pautas) como assinada. Não guarda nenhum PIN:
   * o campo `directorPin` guardava um segredo em texto simples dentro da base de
   * dados, o que não acrescentava segurança nenhuma. A verificação real de
   * identidade é feita com `reauthenticate()` antes de chamar este método.
   */
  public markPautaAsSigned(directorName: string) {
    this.db.pauta.status = 'homologada';
    this.db.pauta.isDirectorSigned = true;
    this.db.pauta.directorName = directorName;
    this.db.pauta.directorSignedAt = `${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
    this.notify();
  }

  // Tuition Invoices
  public addPayment(invoiceId: string, method: 'mcx' | 'multicaixa' | 'debito' | 'numerario' | 'tpa', amountKz?: number) {
    const idStr = String(invoiceId);
    const inv = this.db.invoices.find((i) => i.id === idStr || String((i as any).id) === idStr);
    if (inv) {
      inv.status = 'pago';
      inv.method = method;
      inv.methodLabel =
        method === 'mcx'
          ? 'Multicaixa Express (MCX)'
          : method === 'multicaixa'
          ? 'Referência Multicaixa'
          : method === 'numerario'
          ? 'Numerário / Balcão'
          : method === 'debito'
          ? 'Débito Direto'
          : 'TPA Terminal Físico';
      const now = new Date();
      const dateStr = `${now.toLocaleDateString('pt-PT')} ${now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
      inv.paymentDate = dateStr;
      inv.receiptNumber = inv.receiptNumber || `RC ${now.getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
      inv.receiptGeneratedAt = dateStr;
      if (amountKz && amountKz > 0) {
        inv.totalAmountKz = amountKz;
      }

      // Automatically update the student's tuition status in the database
      const student = this.db.students.find((s) => String(s.id) === String(inv.studentId));
      if (student) {
        student.isTuitionPaidCurrentMonth = true;
        const hasOtherDebts = this.db.invoices.some(
          (other) =>
            String(other.studentId) === String(student.id) &&
            other.id !== inv.id &&
            other.status === 'atraso'
        );
        if (!hasOtherDebts) {
          student.financialStatus = 'regular';
        }
      }

      this.notify();
    }
  }

  public getNextInvoiceNumber(): string {
    const currentYear = new Date().getFullYear();
    const prefix = `FT ${currentYear}/`;
    const all = [...(this.db.invoices || []), ...(this.db.tuitionFees || [])];
    let maxSeq = 1849;
    for (const inv of all) {
      if (inv.invoiceNumber) {
        // match FT YYYY/SEQ or FT SEQ
        const match = inv.invoiceNumber.match(/(?:FT\s*(?:BM)?\s*(?:\d{4})?\/?)(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    }
    return `${prefix}${maxSeq + 1}`;
  }

  public createInvoice(invoice: Omit<TuitionInvoice, 'id' | 'invoiceNumber' | 'daysLate'>): TuitionInvoice {
    const newInv: TuitionInvoice = {
      ...invoice,
      id: `inv-${Date.now()}`,
      invoiceNumber: this.getNextInvoiceNumber(),
      daysLate: 0
    };
    this.db.invoices = [newInv, ...this.db.invoices];
    this.notify();
    return newInv;
  }

  public recordFullPaymentInvoice(invoiceData: Partial<TuitionInvoice> & { studentId: string; totalAmountKz: number }): TuitionInvoice {
    const year = new Date().getFullYear();
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = `${day}/${month}/${year}`;

    const newInv: TuitionInvoice = {
      id: invoiceData.id || `inv-${Date.now()}`,
      invoiceNumber: invoiceData.invoiceNumber || this.getNextInvoiceNumber(),
      studentId: invoiceData.studentId,
      studentName: invoiceData.studentName || 'Aluno',
      procNumber: invoiceData.procNumber || '0000',
      avatar: invoiceData.avatar || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=150',
      className: invoiceData.className || 'Turma A',
      guardianName: invoiceData.guardianName || 'Encarregado',
      // Sem NIF/BI real fornecido: nunca inventa um número fiscal/documento de identidade.
      guardianNif: invoiceData.guardianNif || '',
      guardianPhone: invoiceData.guardianPhone || '+244 923 000 000',
      guardianAddress: invoiceData.guardianAddress || 'Luanda, Angola',
      studentBiNumber: invoiceData.studentBiNumber || '',
      operatorName: invoiceData.operatorName || `${this.getCurrentUser().name} (${this.getCurrentUser().roleTitle || 'Secretaria Geral'})`,
      description: invoiceData.description || 'Pagamento de Propinas e Emolumentos',
      period: invoiceData.period || 'Março / 2026',
      dueDate: invoiceData.dueDate || now.toISOString().split('T')[0],
      totalAmountKz: invoiceData.totalAmountKz,
      baseAmountKz: invoiceData.baseAmountKz || invoiceData.totalAmountKz,
      lateFeeKz: invoiceData.lateFeeKz || 0,
      status: 'pago',
      daysLate: 0,
      method: invoiceData.method || 'tpa',
      methodLabel: invoiceData.methodLabel || 'TPA Multicaixa / Caixa Geral',
      bankName: invoiceData.bankName || 'Caixa Central / Tesouraria',
      transactionNumber: invoiceData.transactionNumber || this.getNextTransactionNumber(),
      paymentDate: dateStr,
      receiptNumber: invoiceData.receiptNumber || `RC ${year}/${Math.floor(1000 + Math.random() * 9000)}`,
      receiptGeneratedAt: dateStr,
      saftHash: invoiceData.saftHash || undefined,
      items: invoiceData.items || [
        {
          code: 'PROP-ESC',
          description: `Propinas Escolares (${invoiceData.period || 'Mês'})`,
          periodOrRef: invoiceData.period || this.db.settings?.currentAcademicYear || getFallbackAcademicYear(),
          unitPriceKz: invoiceData.totalAmountKz,
          quantity: 1,
          discountKz: 0,
          taxRegime: 'Isento (Art. 12 CIVA)',
          liquidTotalKz: invoiceData.totalAmountKz
        }
      ],
      subtotalKz: invoiceData.subtotalKz || invoiceData.totalAmountKz,
      discountName: invoiceData.discountName || 'Sem Desconto',
      discountAmountKz: invoiceData.discountAmountKz || 0,
      stampDutyKz: invoiceData.stampDutyKz || Math.round(invoiceData.totalAmountKz * 0.001),
      totalPaidKz: invoiceData.totalPaidKz ?? invoiceData.totalAmountKz,
      selectedMonths: invoiceData.selectedMonths || [invoiceData.period || 'Março']
    };
    // Respeita o estado calculado pelo chamador (ex.: 'pendente' quando um
    // pagamento parcial foi registado ao abrigo da política de Amortização) em
    // vez de assumir sempre pagamento total.
    newInv.status = invoiceData.status || 'pago';

    this.db.invoices = [newInv, ...(this.db.invoices || [])];

    // Update student tuition status
    const student = this.db.students.find((s) => String(s.id) === String(invoiceData.studentId));
    if (student) {
      if (newInv.status === 'pago') {
        student.isTuitionPaidCurrentMonth = true;
        student.financialStatus = 'regular';
      } else {
        student.isTuitionPaidCurrentMonth = false;
        student.financialStatus = 'debito';
      }
    }

    this.addNotification({
      title: `Recibo Emitido: ${newInv.receiptNumber || newInv.invoiceNumber}`,
      message: `${newInv.studentName} — ${Number(newInv.totalAmountKz).toLocaleString()} Kz (${newInv.period})`,
      type: 'finance',
      priority: 'normal',
      linkView: 'propinas'
    });

    this.notify();
    return newInv;
  }

  public getNextTransactionNumber(): string {
    const invoices = this.db.invoices || [];
    let maxSeq = 0;
    for (const inv of invoices) {
      if (inv.transactionNumber) {
        const match = inv.transactionNumber.match(/TRANS(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    }
    const next = maxSeq + 1;
    return `TRANS${String(next).padStart(3, '0')}`;
  }

  // School Services & Emoluments Catalog
  public getServices(): SchoolServiceItem[] {
    return this.db.services || defaultServices;
  }

  public addService(service: Omit<SchoolServiceItem, 'id'>): SchoolServiceItem {
    const newService: SchoolServiceItem = {
      ...service,
      id: `srv-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.db.services = [...(this.db.services || defaultServices), newService];
    this.notify();
    return newService;
  }

  public updateService(id: string, updates: Partial<SchoolServiceItem>) {
    const currentServices = this.db.services || defaultServices;
    this.db.services = currentServices.map((s) => (s.id === id ? { ...s, ...updates } : s));
    this.notify();
  }

  public deleteService(id: string) {
    const currentServices = this.db.services || defaultServices;
    this.db.services = currentServices.filter((s) => s.id !== id);
    this.notify();
  }

  // Notices
  public addNotice(notice: Omit<Notice, 'id' | 'date' | 'readsCount'>): Notice {
    const newNotice: Notice = {
      ...notice,
      id: `not-${Date.now()}`,
      date: 'Hoje, ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
      readsCount: 1
    };
    this.db.notices = [newNotice, ...this.db.notices];

    // Trigger real-time school notification
    this.addNotification({
      title: `Aviso Escolar: ${newNotice.title}`,
      message: newNotice.excerpt || newNotice.content.substring(0, 90),
      type: 'notice',
      priority: newNotice.priority === 'urgente' ? 'urgente' : newNotice.priority === 'alta' ? 'alta' : 'normal',
      targetRoles: newNotice.targetRoles,
      linkView: 'mural_biblioteca'
    });

    this.notify();
    return newNotice;
  }

  // School Notifications CRUD & Real-Time Handling
  public getNotifications(role?: UserRole, userId?: string): SchoolNotification[] {
    const list = this.db.notifications || defaultNotifications;
    return list.filter((n) => {
      const roleOk = !role || !n.targetRoles || n.targetRoles.includes(role);
      const userOk = !n.targetUserId || (!!userId && String(n.targetUserId) === String(userId));
      return roleOk && userOk;
    });
  }

  public addNotification(
    notif: Omit<SchoolNotification, 'id' | 'timestamp' | 'read' | 'createdAt'> & {
      id?: string;
      timestamp?: string;
      read?: boolean;
      createdAt?: number;
    }
  ): SchoolNotification {
    const now = Date.now();
    const newNotif: SchoolNotification = {
      id: notif.id || `notif-${now}-${Math.random().toString(36).substring(2, 6)}`,
      title: notif.title,
      message: notif.message,
      type: notif.type || 'notice',
      priority: notif.priority || 'normal',
      timestamp: notif.timestamp || 'Agora',
      read: notif.read ?? false,
      targetRoles: notif.targetRoles,
      targetUserId: notif.targetUserId,
      linkView: notif.linkView,
      linkId: notif.linkId,
      createdAt: notif.createdAt || now
    };

    const current = this.db.notifications || defaultNotifications;
    this.db.notifications = [newNotif, ...current.filter((n) => n.id !== newNotif.id)].slice(0, 50);

    // Dispatch window custom event for real-time reactive listening
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('bandmed:school_notification', { detail: newNotif })
        );
      } catch {
        // ignore
      }
    }

    this.notify();
    return newNotif;
  }

  public markNotificationAsRead(id: string) {
    if (!this.db.notifications) {
      this.db.notifications = [...defaultNotifications];
    }
    this.db.notifications = this.db.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    this.notify();
  }

  public markAllNotificationsAsRead() {
    if (!this.db.notifications) {
      this.db.notifications = [...defaultNotifications];
    }
    this.db.notifications = this.db.notifications.map((n) => ({ ...n, read: true }));
    this.notify();
  }

  public deleteNotification(id: string) {
    if (!this.db.notifications) {
      this.db.notifications = [...defaultNotifications];
    }
    this.db.notifications = this.db.notifications.filter((n) => n.id !== id);
    this.notify();
  }

  public clearAllNotifications() {
    this.db.notifications = [];
    this.notify();
  }

  // Library
  public issueBookLoan(bookId: string, borrower: { id?: string; name: string; role: string }): { success: boolean; error?: string } {
    const book = (this.db.books || []).find((b) => b.id === bookId);
    if (!book) return { success: false, error: 'Livro não encontrado.' };
    if (!borrower?.name?.trim()) return { success: false, error: 'Escolha o leitor.' };
    const policy = this.getLibraryPolicy();
    const asOf = this.todayISO();
    const key = borrowerKeyOf({ borrowerId: borrower.id, borrowerName: borrower.name });
    const blockers = borrowBlockers({ availableCopies: book.availableCopies, borrowerKey: key, loans: (this.db.loans || []) as any, asOf, policy });
    if (blockers.length) return { success: false, error: blockers[0] };
    book.availableCopies -= 1;
    const loan: BookLoan = {
      id: this.newId('emp'), bookId, bookTitle: book.title, borrowerId: borrower.id, borrowerName: borrower.name,
      borrowerRole: borrower.role, borrowDate: asOf, dueDate: addDaysISO(asOf, policy.loanDays), status: 'ativo', renewals: 0
    };
    this.db.loans = [loan, ...(this.db.loans || [])];
    this.notify();
    return { success: true };
  }

  public returnBookLoan(loanId: string): { success: boolean; error?: string } {
    const loan = (this.db.loans || []).find((l) => l.id === loanId);
    if (!loan) return { success: false, error: 'Empréstimo não encontrado.' };
    if (loan.returnDate || loan.status === 'devolvido' || loan.status === 'perdido') return { success: false, error: 'O empréstimo já está encerrado.' };
    const returned = returnLoan(loan as any, this.todayISO(), this.getLibraryPolicy());
    this.db.loans = this.db.loans.map((l) => (l.id === loanId ? ({ ...l, ...returned } as BookLoan) : l));
    const book = (this.db.books || []).find((b) => b.id === loan.bookId);
    if (book) book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
    this.notify();
    return { success: true };
  }

  // Settings
  public updateSettings(updates: Partial<InstitutionSettings>) {
    this.db.settings = { ...this.db.settings, ...updates };
    this.notify();
  }

  public setAcademicTrimester(trimester: '1' | '2' | '3') {
    this.db.settings = { ...this.db.settings, currentTrimester: trimester };
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Diretor Pedagógico',
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action: 'Alteração de Trimestre Ativo',
      details: `O sistema passou a operar no ${trimester}.º Trimestre oficial.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
  }

  public restoreDatabase(importedDb: Partial<SchoolDatabase>) {
    if (!importedDb || typeof importedDb !== 'object') {
      throw new Error('Formato de base de dados inválido.');
    }
    const currentSettings = this.db.settings;
    this.db = {
      ...this.db,
      ...importedDb,
      settings: { ...currentSettings, ...(importedDb.settings || {}) }
    };
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador Geral',
      userRole: 'Administrador',
      action: 'Restauração de Base de Dados',
      details: 'Base de dados restaurada com sucesso a partir de ficheiro de cópia de segurança.',
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#ac332b'
    });
    this.notify();
  }

  // Factory reset
  public resetToFactoryDemo() {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      idbService.clear();
    } catch (e) {
      console.warn(e);
    }
    this.db = getInitialDb();
    this.notify();
  }

  public resetToDefaults() {
    this.resetToFactoryDemo();
  }

  public addTuitionFee(fee: any) {
    const studentIdStr = String(fee.studentId);
    const student = this.db.students.find((s) => String(s.id) === studentIdStr);
    // Nunca inventa a propina: usa a Tabela Financeira real configurada para a classe
    // do aluno quando não há valor explícito na própria fee/aluno.
    const studentClass = student ? this.db.classes.find((c) => String(c.id) === String(student.classId)) : undefined;
    const tuitionRow = studentClass ? findTuitionRowForGrade(this.db.settings?.tuitionRows, studentClass.grade) : undefined;
    const amount = Number(fee.totalAmountKz || fee.baseAmountKz || student?.monthlyTuitionKz || tuitionRow?.monthlyTuitionKz || 0);
    const lateFee = Number(fee.lateFeeKz || 0);
    const year = new Date().getFullYear();
    const resolvedInvoiceNumber = fee.invoiceNumber || this.getNextInvoiceNumber();

    const newInv: TuitionInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: resolvedInvoiceNumber,
      receiptNumber: fee.receiptNumber,
      studentId: studentIdStr,
      studentName: fee.studentName || student?.name || 'Aluno',
      procNumber: fee.procNumber || student?.procNumber || '',
      avatar: student?.avatar || fee.avatar || '',
      className: student?.className || fee.className || '',
      guardianName: student?.guardianName || fee.guardianName || 'Encarregado de Educação',
      guardianNif: student?.guardianNif || fee.guardianNif || '',
      period: fee.period || 'Mês Corrente',
      description: fee.description || `Propina Mensal — ${fee.period || 'Mês Corrente'}`,
      baseAmountKz: Number(fee.baseAmountKz || amount),
      lateFeeKz: lateFee,
      totalAmountKz: amount + lateFee,
      dueDate: fee.dueDate || `${year}-12-08`,
      daysLate: 0,
      paymentDate: fee.paymentDate,
      status: fee.status || 'pendente',
      method: fee.method,
      methodLabel: fee.methodLabel,
      // Entidade e referência vêm da integração EMIS configurada pela
      // instituição (Configurações → Integrações & AGT). Sem entidade
      // registada, a fatura fica sem referência e é paga ao balcão.
      ...(fee.multicaixaEntity && fee.multicaixaRef
        ? { multicaixaEntity: fee.multicaixaEntity, multicaixaRef: fee.multicaixaRef }
        : buildMulticaixaFields(
            resolvedInvoiceNumber,
            amount + lateFee,
            this.db.settings?.integrations?.emisEntity
          ))
    };

    this.db.invoices = [newInv, ...this.db.invoices];
    if (student && newInv.status === 'atraso') {
      student.financialStatus = 'debito';
    }
    this.notify();
    return newInv;
  }

  public updateTuitionFee(feeId: any, updates: Partial<TuitionInvoice>) {
    const idStr = String(feeId);
    this.db.invoices = this.db.invoices.map((inv) => {
      if (inv.id === idStr || String((inv as any).id) === idStr) {
        const merged = { ...inv, ...updates };
        if (updates.status === 'pago') {
          const student = this.db.students.find((s) => String(s.id) === String(merged.studentId));
          if (student) {
            student.isTuitionPaidCurrentMonth = true;
            const hasOtherDebts = this.db.invoices.some(
              (other) =>
                String(other.studentId) === String(student.id) &&
                String(other.id) !== idStr &&
                other.status === 'atraso'
            );
            if (!hasOtherDebts) {
              student.financialStatus = 'regular';
            }
          }
        }
        return merged;
      }
      return inv;
    });
    this.notify();
  }

  public deleteTuitionFee(feeId: any) {
    const idStr = String(feeId);
    if (this.db.invoices) {
      this.db.invoices = this.db.invoices.filter(
        (inv) => inv.id !== idStr && String((inv as any).id) !== idStr
      );
    }
    if (this.db.tuitionFees) {
      this.db.tuitionFees = this.db.tuitionFees.filter(
        (inv) => inv.id !== idStr && String((inv as any).id) !== idStr
      );
    }
    this.notify();
  }

  /**
   * Sincroniza automaticamente o calendário académico com a data do sistema.
   * Não existe qualquer passagem manual de trimestre ou de ano letivo:
   *
   *  1. TRIMESTRE — o trimestre em curso é sempre o que contém a data de hoje.
   *     Quando um trimestre termina, o dia seguinte já pertence ao trimestre
   *     seguinte (ver resolveActiveTrimester em utils/academicCalendar.ts).
   *  2. ANO LETIVO — quando a data de hoje ultrapassa o Término do Período de
   *     Atividade, o ano letivo é arquivado (fica registado em
   *     settings.academicYearHistory com o calendário com que funcionou) e o ano
   *     seguinte é aberto automaticamente: 2026/2027 dá lugar a 2027/2028, com o
   *     período proposto de 1 de Setembro a 31 de Julho e os três trimestres
   *     pré-distribuídos, prontos a ajustar.
   *
   * Toda a informação já gravada permanece associada ao ano em que foi
   * produzida — o ano letivo anterior passa apenas a constar como ano passado.
   * Deve ser chamado no arranque da aplicação e periodicamente enquanto esta
   * estiver aberta.
   */
  public syncAcademicCalendar(reference: Date = new Date()): {
    changed: boolean;
    rolledOverTo?: string;
    trimester?: '1' | '2' | '3';
  } {
    if (!this.db.settings) {
      this.db.settings = { ...defaultSettings };
    }
    const settings = this.db.settings;
    let changed = false;
    let rolledOverTo: string | undefined;

    const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

    // --- 1. Período de Atividade: normaliza para ISO (registos anteriores a esta
    // versão guardavam apenas o texto "02 Set 2026 — 31 Jul 2027").
    let startIso = anyDateToIso(settings.academicPeriodStartIso);
    let endIso = anyDateToIso(settings.academicPeriodEndIso);

    if ((!startIso || !endIso) && settings.academicPeriod) {
      const parsed = parsePeriodRange(settings.academicPeriod);
      startIso = startIso || parsed.startIso;
      endIso = endIso || parsed.endIso;
      if (startIso || endIso) changed = true;
    }
    if ((!startIso || !endIso) && settings.currentAcademicYear) {
      const proposed = defaultPeriodForAcademicYear(settings.currentAcademicYear);
      startIso = startIso || proposed.startIso;
      endIso = endIso || proposed.endIso;
      if (startIso || endIso) changed = true;
    }

    // --- 2. Transição automática de Ano Letivo.
    const endDate = isoToDate(endIso);
    if (endDate && today.getTime() > endDate.getTime()) {
      const closingYear = settings.currentAcademicYear || '';
      const history = [...(settings.academicYearHistory || [])];
      if (!history.some((h) => h.academicYear === closingYear) && closingYear) {
        history.push({
          academicYear: closingYear,
          period: settings.academicPeriod,
          periodStartIso: startIso,
          periodEndIso: endIso,
          weeks: settings.academicWeeks,
          trimesterSchedules: settings.trimesterSchedules,
          archivedAt: new Date().toISOString()
        });
      }

      const nextYear = nextAcademicYearLabel(closingYear);
      const nextPeriod = defaultPeriodForAcademicYear(nextYear);
      const nextTrimesters = proposeTrimesterDates(nextPeriod.startIso, nextPeriod.endIso);

      const buildSchedule = (range: { startIso: string; endIso: string }) => {
        const weeks = countSchoolWeeks(range.startIso, range.endIso);
        return {
          startDate: isoToPtDate(range.startIso),
          endDate: isoToPtDate(range.endIso),
          startDateIso: range.startIso,
          endDateIso: range.endIso,
          examPeriod: '',
          examStartDateIso: '',
          examEndDateIso: '',
          gradesCouncilDate: '',
          gradesCouncilDateIso: '',
          weeksCount: formatWeeksLabel(weeks),
          weeksCountNumber: weeks,
          closed: false
        };
      };

      const availableYears = settings.availableAcademicYears || [];
      settings.academicYearHistory = history;
      settings.currentAcademicYear = nextYear;
      // As notas do ano que fechou ficam arquivadas em cada aluno; o novo ano começa vazio.
      this.alignAllStudentGradesToYear(nextYear, closingYear);
      settings.availableAcademicYears = availableYears.includes(nextYear)
        ? availableYears
        : [...availableYears, nextYear];
      settings.academicPeriodStartIso = nextPeriod.startIso;
      settings.academicPeriodEndIso = nextPeriod.endIso;
      settings.academicPeriod = formatPeriodRange(nextPeriod.startIso, nextPeriod.endIso);
      settings.trimesterSchedules = {
        t1: buildSchedule(nextTrimesters[0]),
        t2: buildSchedule(nextTrimesters[1]),
        t3: buildSchedule(nextTrimesters[2])
      };
      settings.currentTrimester = '1';
      settings.academicHolidays = getDefaultAngolaHolidays(nextYear).map((h, i) => ({
        id: `holiday-${nextYear.replace('/', '-')}-${i}`,
        date: h.date,
        name: h.name,
        trimestre: h.trimestre
      }));

      startIso = nextPeriod.startIso;
      endIso = nextPeriod.endIso;
      rolledOverTo = nextYear;
      changed = true;

      this.addAuditLog({
        userName: 'Sistema',
        userRole: 'Automático',
        action: 'Abertura Automática de Ano Letivo',
        details: `O Ano Letivo ${closingYear} terminou a ${isoToPtDate(
          history[history.length - 1]?.periodEndIso
        ) || 'data configurada'} e ficou arquivado como ano passado. O Ano Letivo ${nextYear} foi aberto automaticamente (${settings.academicPeriod}).`,
        module: 'sistema',
        timestamp: 'Agora mesmo',
        badgeColor: '#0b1f3a'
      });
    }

    // --- 3. Semanas Letivas do ano, sempre recalculadas a partir do período.
    const academicWeeks = countSchoolWeeks(startIso, endIso);
    if (academicWeeks && settings.academicWeeksNumber !== academicWeeks) {
      settings.academicWeeksNumber = academicWeeks;
      settings.academicWeeks = formatWeeksLabel(academicWeeks, 'Semanas Letivas');
      changed = true;
    }
    if (startIso && endIso) {
      const periodLabel = formatPeriodRange(startIso, endIso);
      if (
        settings.academicPeriodStartIso !== startIso ||
        settings.academicPeriodEndIso !== endIso ||
        settings.academicPeriod !== periodLabel
      ) {
        settings.academicPeriodStartIso = startIso;
        settings.academicPeriodEndIso = endIso;
        settings.academicPeriod = periodLabel;
        changed = true;
      }
    }

    // --- 4. Trimestre em curso, determinado só pelas datas.
    const activeTrimester = resolveActiveTrimester(settings.trimesterSchedules, today);
    if (activeTrimester && settings.currentTrimester !== activeTrimester) {
      const previous = settings.currentTrimester;
      settings.currentTrimester = activeTrimester;
      changed = true;
      this.addAuditLog({
        userName: 'Sistema',
        userRole: 'Automático',
        action: 'Passagem Automática de Trimestre',
        details: `O ${previous}.º Trimestre chegou ao fim e o sistema passou a operar no ${activeTrimester}.º Trimestre, segundo as datas definidas em Configurações > Ano Letivo.`,
        module: 'sistema',
        timestamp: 'Agora mesmo',
        badgeColor: '#0b1f3a'
      });
    }

    if (changed) {
      this.db.settings = { ...settings };
      this.notify();
    }

    return { changed, rolledOverTo, trimester: settings.currentTrimester };
  }

  /**
   * Define as turmas vinculadas a um curso (escolhidas no formulário do curso).
   * A área curricular das turmas selecionadas passa a ser o nome do curso; as
   * turmas que deixaram de estar vinculadas e ainda apontavam para este curso
   * ficam sem área atribuída, para não continuarem a aparecer como sendo dele.
   */
  public setCourseLinkedClasses(courseId: string, classIds: string[]) {
    const courses = this.db.courses || defaultCourses;
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;

    const previous = course.linkedClassIds || [];
    const next = Array.from(new Set(classIds.filter(Boolean)));

    this.db.courses = courses.map((c) => (c.id === courseId ? { ...c, linkedClassIds: next } : c));

    this.db.classes = (this.db.classes || []).map((cls) => {
      if (next.includes(cls.id)) {
        return { ...cls, area: course.name };
      }
      if (previous.includes(cls.id) && cls.area === course.name) {
        return { ...cls, area: '' };
      }
      return cls;
    });

    this.notify();
  }

  public setAcademicYear(year: string) {
    if (!this.db.settings) {
      this.db.settings = { ...defaultSettings };
    }
    const previousYear = this.db.settings.currentAcademicYear;
    this.db.settings.currentAcademicYear = year;
    if (previousYear !== year) this.alignAllStudentGradesToYear(year, previousYear);
    if (!this.db.settings.availableAcademicYears || this.db.settings.availableAcademicYears.length === 0) {
      this.db.settings.availableAcademicYears = [year];
    }
    if (!this.db.settings.availableAcademicYears.includes(year)) {
      this.db.settings.availableAcademicYears.push(year);
    }

    // Ao mudar de ano letivo, o calendário acompanha: se o ano já tem histórico
    // arquivado, recupera-se o período e os trimestres com que funcionou; caso
    // contrário aplica-se o período proposto (1 Set — 31 Jul) desse ano.
    if (previousYear !== year) {
      const archived = (this.db.settings.academicYearHistory || []).find((h) => h.academicYear === year);
      if (archived) {
        this.db.settings.academicPeriod = archived.period || '';
        this.db.settings.academicPeriodStartIso = archived.periodStartIso || '';
        this.db.settings.academicPeriodEndIso = archived.periodEndIso || '';
        this.db.settings.academicWeeks = archived.weeks || '';
        if (archived.trimesterSchedules) {
          this.db.settings.trimesterSchedules = archived.trimesterSchedules;
        }
      } else {
        const proposed = defaultPeriodForAcademicYear(year);
        if (proposed.startIso && proposed.endIso) {
          this.db.settings.academicPeriodStartIso = proposed.startIso;
          this.db.settings.academicPeriodEndIso = proposed.endIso;
          this.db.settings.academicPeriod = formatPeriodRange(proposed.startIso, proposed.endIso);
          const weeks = countSchoolWeeks(proposed.startIso, proposed.endIso);
          this.db.settings.academicWeeks = formatWeeksLabel(weeks, 'Semanas Letivas');
          this.db.settings.academicWeeksNumber = weeks;
        }
      }
    }

    this.notify();
    if (this.shardMode && previousYear !== year) {
      void this.reloadYearScopedShards(year);
    }
  }

  /**
   * Encerra e tranca oficialmente um Trimestre (Configurações > Ano Letivo > "Encerrar"):
   * marca trimesterSchedules[tN].closed = true, com data e autor do encerramento. A partir
   * daqui, a Assiduidade deixa de aceitar novos sumários/edições com data dentro deste
   * trimestre, e as Pautas deixam de aceitar lançamento de notas para ele — ver
   * getSummaryLockInfo/getGradeLaunchLockInfo em utils/academicYear.ts.
   */
  public closeTrimester(trimester: '1' | '2' | '3') {
    if (!this.db.settings) {
      this.db.settings = { ...defaultSettings };
    }
    const key = ('t' + trimester) as 't1' | 't2' | 't3';
    const existing = this.db.settings.trimesterSchedules?.[key] || ({} as any);
    const closedAt = new Date().toISOString();
    const closedBy = this.db.currentUser?.name || 'Direção Pedagógica';
    this.db.settings.trimesterSchedules = {
      ...(this.db.settings.trimesterSchedules as any),
      [key]: { ...existing, closed: true, closedAt, closedBy }
    };
    this.addAuditLog({
      userName: closedBy,
      userRole: this.db.currentUser?.roleTitle || 'Direção Pedagógica',
      action: 'Encerramento de Trimestre',
      details: `O ${trimester}.º Trimestre foi oficialmente homologado e trancado para edição de sumários e lançamento de notas.`,
      module: 'pautas',
      timestamp: 'Agora mesmo',
      badgeColor: '#ac332b'
    });
    this.notify();
  }

  /**
   * Reabre um Trimestre previamente encerrado (ação reservada à Direção/Administração —
   * regra 'pautas.unlock'), permitindo novamente a edição de sumários e o lançamento de
   * notas dentro desse período.
   */
  public reopenTrimester(trimester: '1' | '2' | '3') {
    if (!this.db.settings?.trimesterSchedules) return;
    const key = ('t' + trimester) as 't1' | 't2' | 't3';
    const existing = this.db.settings.trimesterSchedules[key];
    if (!existing) return;
    this.db.settings.trimesterSchedules = {
      ...this.db.settings.trimesterSchedules,
      [key]: { ...existing, closed: false }
    };
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Direção Pedagógica',
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action: 'Reabertura de Trimestre',
      details: `O ${trimester}.º Trimestre foi reaberto para edição de sumários e lançamento de notas.`,
      module: 'pautas',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
  }

  /**
   * Sincroniza os Feriados Oficiais da República de Angola (Configurações > Ano Letivo >
   * "Sincronizar") com o Ano Letivo Vigente, acrescentando ao calendário os que ainda não
   * estejam registados na base de dados (sem duplicar os já existentes, identificados por
   * data). Devolve a lista final de feriados gravada.
   */
  public syncOfficialHolidays() {
    if (!this.db.settings) {
      this.db.settings = { ...defaultSettings };
    }
    const academicYear = this.db.settings.currentAcademicYear || '';
    const defaults = getDefaultAngolaHolidays(academicYear);
    const existing = Array.isArray(this.db.settings.academicHolidays) ? this.db.settings.academicHolidays : [];
    const existingDates = new Set(existing.map((h) => h.date));
    const additions = defaults
      .filter((h) => !existingDates.has(h.date))
      .map((h) => ({ id: `holiday-${h.date}`, date: h.date, name: h.name, trimestre: h.trimestre }));
    const merged = [...existing, ...additions].sort((a, b) => a.date.localeCompare(b.date));
    this.db.settings.academicHolidays = merged;
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action: 'Sincronização de Feriados Oficiais',
      details: `Calendário de Feriados Oficiais sincronizado para o Ano Letivo ${academicYear || 'vigente'} (${additions.length} novo(s) feriado(s) adicionado(s)).`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return merged;
  }

  public generateMonthlyBatchInvoices(period: string, dueDate: string, classId?: string): number {
    const targetStudents = (this.db.students || []).filter((s) => {
      if (classId && classId !== 'all') {
        return s.classId === classId;
      }
      return true;
    });

    let count = 0;
    const newInvoices: TuitionInvoice[] = [];

    targetStudents.forEach((student) => {
      const exists = this.db.invoices.some(
        (inv) =>
          String(inv.studentId) === String(student.id) &&
          inv.period.toLowerCase() === period.toLowerCase()
      );
      if (!exists) {
        // Nunca inventa a propina: usa o valor real do aluno ou, na falta dele,
        // a Tabela Financeira real configurada para a classe.
        const studentClass = this.db.classes.find((c) => String(c.id) === String(student.classId));
        const tuitionRow = studentClass ? findTuitionRowForGrade(this.db.settings?.tuitionRows, studentClass.grade) : undefined;
        const tuition = student.monthlyTuitionKz || tuitionRow?.monthlyTuitionKz || 0;
        newInvoices.push({
          id: `inv-${Date.now()}-${student.id}`,
          invoiceNumber: this.getNextInvoiceNumber(),
          studentId: String(student.id),
          studentName: student.name,
          procNumber: student.procNumber,
          avatar: student.avatar || '',
          className: student.className,
          guardianName: student.guardianName,
          guardianNif: student.guardianNif || '',
          period,
          description: `Propina Mensal Escolar — ${period}`,
          baseAmountKz: tuition,
          lateFeeKz: 0,
          totalAmountKz: tuition,
          dueDate,
          daysLate: 0,
          status: 'pendente',
          ...buildMulticaixaFields(
            this.getNextInvoiceNumber(),
            tuition,
            this.db.settings?.integrations?.emisEntity
          )
        });
        count++;
      }
    });

    if (newInvoices.length > 0) {
      this.db.invoices = [...newInvoices, ...this.db.invoices];
      this.notify();
    }
    return count;
  }

  // Institutional Audit Logs
  public getAuditLogs(): SchoolAuditLog[] {
    return this.db.auditLogs || defaultAuditLogs;
  }

  public addAuditLog(entry: Omit<SchoolAuditLog, 'id' | 'createdAt'>) {
    if (!this.db.auditLogs) {
      this.db.auditLogs = [...defaultAuditLogs];
    }

    // O Registo de Auditoria tem de identificar SEMPRE a pessoa que estava autenticada
    // quando a operação foi feita. Vários pontos da aplicação passavam rótulos fixos
    // ("Direção Financeira", "Administrador Geral", "Diretor Pedagógico"), o que tornava
    // a trilha de conformidade inútil. O utilizador autenticado tem prioridade sobre
    // qualquer nome enviado pelo chamador; o valor recebido fica apenas como recurso
    // para operações automáticas do sistema (sem sessão iniciada).
    const actor = this.db.currentUser;
    const resolvedUserName = actor?.name?.trim() || entry.userName || 'Sistema';
    const resolvedUserRole =
      actor?.roleTitle?.trim() || actor?.role || entry.userRole || 'Sistema';
    const resolvedAvatar = entry.avatar || actor?.avatar;

    // Praticamente todos os chamadores passavam a string literal "Agora mesmo", pelo que
    // a coluna Data / Hora nunca envelhecia. Guarda-se a data e hora reais da operação.
    const now = new Date();
    const placeholderTimestamp =
      !entry.timestamp || /^agora\s*mesmo$/i.test(entry.timestamp.trim());
    const resolvedTimestamp = placeholderTimestamp
      ? `${now.toLocaleDateString('pt-PT')} ${now.toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit'
        })}`
      : entry.timestamp;

    const newLog: SchoolAuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: Date.now(),
      ...entry,
      userName: resolvedUserName,
      userRole: resolvedUserRole,
      timestamp: resolvedTimestamp,
      ...(resolvedAvatar ? { avatar: resolvedAvatar } : {})
    };
    this.db.auditLogs = [newLog, ...this.db.auditLogs].slice(0, 100);
    this.notify();
    return newLog;
  }

  // Institutional Calendar Events
  public getEvents(): SchoolCalendarEvent[] {
    return this.db.events || defaultEvents;
  }

  public addEvent(event: Omit<SchoolCalendarEvent, 'id'>) {
    if (!this.db.events) {
      this.db.events = [...defaultEvents];
    }
    const newEvt: SchoolCalendarEvent = {
      id: `evt-${Date.now()}`,
      ...event
    };
    this.db.events = [...this.db.events, newEvt];
    this.addAuditLog({
      userName: this.db.currentUser?.name || 'Administrador',
      userRole: this.db.currentUser?.roleTitle || 'Secretaria',
      action: 'Agendamento de Evento',
      details: `Novo evento marcado na agenda: "${newEvt.title}" (${newEvt.date}).`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return newEvt;
  }

  public deleteEvent(id: string) {
    if (!this.db.events) return;
    this.db.events = this.db.events.filter((e) => e.id !== id);
    this.notify();
  }

  // --- Homologação de pautas -------------------------------------------------

  public getHomologations(): PautaHomologation[] {
    return this.db.homologations || [];
  }

  public findHomologation(
    classId: string,
    subjectId: string,
    trimester: PautaHomologation['trimester']
  ): PautaHomologation | null {
    return (
      (this.db.homologations || []).find(
        (h) =>
          String(h.classId) === String(classId) &&
          String(h.subjectId) === String(subjectId) &&
          h.trimester === trimester
      ) || null
    );
  }

  /**
   * Regista a homologação de uma pauta. Guarda também uma impressão digital das
   * notas assinadas: se alguém alterar notas depois da assinatura, a pauta deixa
   * de coincidir com o que foi homologado e o sistema consegue avisar.
   */
  public homologatePauta(
    record: Omit<PautaHomologation, 'id' | 'signedAt'>
  ): PautaHomologation {
    if (!this.db.homologations) this.db.homologations = [];

    const entry: PautaHomologation = {
      ...record,
      id: `hom-${Date.now()}`,
      signedAt: new Date().toISOString()
    };

    // Uma pauta só pode ter uma homologação ativa por turma/disciplina/trimestre.
    this.db.homologations = [
      entry,
      ...this.db.homologations.filter(
        (h) =>
          !(
            String(h.classId) === String(record.classId) &&
            String(h.subjectId) === String(record.subjectId) &&
            h.trimester === record.trimester
          )
      )
    ];

    this.addAuditLog({
      userName: record.signedByName,
      userRole: record.signedByRole,
      action: 'Homologação de Pauta',
      details:
        `Pauta de ${record.subjectName} — ${record.className} (${record.trimester === 'final' ? 'Final' : record.trimester + '.º trimestre'}) ` +
        `homologada com ${record.studentCount} alunos: ${record.approvedCount} aprovados, ${record.failedCount} não aprovados.`,
      module: 'pedagogico',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });

    this.notify();
    return entry;
  }

  /** Impressão digital estável de um conjunto de notas. */
  public static fingerprintGrades(rows: Array<Record<string, unknown>>): string {
    const canonical = rows
      .map((r) => `${r.studentId}:${r.mt1 ?? ''}|${r.mt2 ?? ''}|${r.mt3 ?? ''}|${r.mfd ?? ''}`)
      .sort()
      .join(';');
    let hash = 5381;
    for (let i = 0; i < canonical.length; i++) {
      hash = ((hash << 5) + hash + canonical.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  // Mini Pauta & Grades Persistence
  public getMiniPautaRows(classId: string, subjectId: string): any[] | null {
    if (this.db.miniPautasStore && this.db.miniPautasStore[classId] && this.db.miniPautasStore[classId][subjectId]) {
      return this.db.miniPautasStore[classId][subjectId];
    }
    return null;
  }

  public saveMiniPautaRows(classId: string, subjectId: string, rows: any[], userName?: string) {
    if (!this.db.miniPautasStore) {
      this.db.miniPautasStore = {};
    }
    if (!this.db.miniPautasStore[classId]) {
      this.db.miniPautasStore[classId] = {};
    }
    this.db.miniPautasStore[classId][subjectId] = rows;

    const classObj = this.db.classes.find((c) => String(c.id) === String(classId));
    const subjectObj = this.db.subjects.find((s) => String(s.id) === String(subjectId));
    const subjectName = subjectObj?.name || 'Disciplina Curricular';

    // Synchronize grades into student records in db.students
    rows.forEach((row) => {
      const student = this.db.students.find(
        (s) => String(s.id) === String(row.studentId) || String(s.procNumber) === String(row.num)
      );
      if (student) {
        // As notas "vivas" do aluno têm de pertencer ao Ano Lectivo Ativo: se ainda são de
        // outro ano, esse ano é arquivado (sem perder nada) antes de gravar as novas.
        this.alignStudentGradesToYear(student, this.db.settings?.currentAcademicYear || '');
        if (!student.trimesterGrades) {
          student.trimesterGrades = [];
        }
        const existingRec = findStudentSubjectRecord(student, String(subjectId), subjectName);
        const existingIdx = existingRec ? student.trimesterGrades.indexOf(existingRec) : -1;
        // Notas de outra escola só trazem médias: enquanto não há avaliações próprias no trimestre, mantêm-se.
        const impAvg = importedAveragesOf(existingRec);

        // Recalcula MT1/MT2/MT3/MFD a partir do MAC/NPP/NPT em vez de confiar
        // ciegamente em row.mt1/row.mfd: se estas linhas vierem de uma sessão
        // antiga do browser ou de uma importação que não recalculou, gravar o
        // valor tal como está perpetuaria médias em 0 na base de dados.
        const rulesForSave = normalizeGradeRules(this.db.settings?.gradeRules as any);
        const mac1 = typeof row.mac1 === 'number' ? row.mac1 : 0;
        const npp1 = typeof row.npp1 === 'number' ? row.npp1 : 0;
        const npt1 = typeof row.npt1 === 'number' ? row.npt1 : 0;
        const mac2 = typeof row.mac2 === 'number' ? row.mac2 : 0;
        const npp2 = typeof row.npp2 === 'number' ? row.npp2 : 0;
        const npt2 = typeof row.npt2 === 'number' ? row.npt2 : 0;
        const mac3 = typeof row.mac3 === 'number' ? row.mac3 : 0;
        const npp3 = typeof row.npp3 === 'number' ? row.npp3 : 0;
        const npt3 = typeof row.npt3 === 'number' ? row.npt3 : 0;
        let mt1Calc: number | '' = calculateMT(mac1, npp1, npt1, rulesForSave);
        let mt2Calc: number | '' = calculateMT(mac2, npp2, npt2, rulesForSave);
        let mt3Calc: number | '' = calculateMT(mac3, npp3, npt3, rulesForSave);
        const keepImp = [1, 2, 3].map((t) => Boolean(impAvg) && !rowHasOwnTrimesterGrades(row, t as 1 | 2 | 3));
        if (impAvg) {
          if (keepImp[0]) mt1Calc = impAvg.mts[0];
          if (keepImp[1]) mt2Calc = impAvg.mts[1];
          if (keepImp[2]) mt3Calc = impAvg.mts[2];
        }
        const mfdCalc = calculateMFD(mt1Calc, mt2Calc, mt3Calc, row.pg, rulesForSave);
        const mfdFromImport = Boolean(impAvg) && mfdCalc === '' && typeof impAvg!.mfd === 'number';
        const mfdVal = typeof mfdCalc === 'number' ? mfdCalc : (mfdFromImport ? (impAvg!.mfd as number) : (impAvg && existingRec ? existingRec.mfd : 10));
        const caVal = calculateCA(mfdVal) as number;
        const blankIf = (k: boolean, v: number) => (k ? ('' as const) : v);
        const rec: StudentTrimesterRecord = {
          subjectId: existingRec && impAvg ? existingRec.subjectId : subjectId,
          subjectName,
          mac1: blankIf(keepImp[0], mac1), npp1: blankIf(keepImp[0], npp1), npt1: blankIf(keepImp[0], npt1), mt1: typeof mt1Calc === 'number' ? mt1Calc : 0,
          mac2: blankIf(keepImp[1], mac2), npp2: blankIf(keepImp[1], npp2), npt2: blankIf(keepImp[1], npt2), mt2: typeof mt2Calc === 'number' ? mt2Calc : 0,
          mac3: blankIf(keepImp[2], mac3), npp3: blankIf(keepImp[2], npp3), npt3: blankIf(keepImp[2], npt3), mt3: typeof mt3Calc === 'number' ? mt3Calc : 0,
          mfd: mfdVal,
          pg: typeof row.pg === 'number' ? row.pg : undefined,
          ca: caVal,
          situation: row.isDesistente ? 'Desistente' : (mfdVal >= 10 ? 'Aprovado' : 'Exame de Recurso'),
          ...(impAvg && (keepImp.some(Boolean) || mfdFromImport)
            ? { origemNota: existingRec!.origemNota, origemDetalhe: existingRec!.origemDetalhe }
            : {})
        };

        if (existingIdx >= 0) {
          student.trimesterGrades[existingIdx] = rec;
        } else {
          student.trimesterGrades.push(rec);
        }

        // Also update disciplineGrades
        if (!student.disciplineGrades) student.disciplineGrades = [];
        const dIdx = student.disciplineGrades.findIndex(
          (d) => d.subject.toLowerCase() === subjectName.toLowerCase()
        );
        if (dIdx >= 0) {
          student.disciplineGrades[dIdx].score = mfdVal;
        } else {
          student.disciplineGrades.push({ subject: subjectName, score: mfdVal, maxScore: 20 });
        }

        student.trimesterGradesYear = this.db.settings?.currentAcademicYear || student.trimesterGradesYear;

        // Recalculate average
        if (student.trimesterGrades.length > 0) {
          const sum = student.trimesterGrades.reduce((acc, curr) => acc + curr.mfd, 0);
          student.currentAverage = Math.round((sum / student.trimesterGrades.length) * 10) / 10;
        }
      }
    });

    // Add Institutional Audit Log
    this.addAuditLog({
      userName: userName || this.db.currentUser?.name || 'Prof. Titular',
      userRole: this.db.currentUser?.roleTitle || 'Professor',
      action: 'Lançamento de Notas',
      details: `Notas atualizadas na disciplina de ${subjectName} (${classObj?.name || classId}) para ${rows.length} alunos.`,
      module: 'pautas',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });

    this.notify();
  }

  /**
   * Garante que as notas "vivas" do aluno (`trimesterGrades`, as que Pautas/Dashboards leem)
   * pertencem ao Ano Lectivo `targetYear`. Se pertencerem a outro ano, esse ano é arquivado em
   * `gradeHistory` (com turma, classe e média) e as notas de `targetYear` — se já tinham sido
   * arquivadas antes — voltam a ser as vivas. Nada é apagado: é uma troca sem perdas.
   * Registos antigos sem carimbo de ano são atribuídos a `assumedYear` (o ano em que estavam).
   * Devolve true se o aluno foi alterado.
   */
  public alignStudentGradesToYear(student: Student, targetYear: string, assumedYear?: string): boolean {
    if (!targetYear) return false;
    const liveYear = student.trimesterGradesYear || assumedYear || targetYear;
    let changed = false;

    if (!student.trimesterGradesYear) {
      student.trimesterGradesYear = liveYear;
      changed = true;
    }
    if (liveYear === targetYear) return changed;

    const history = [...(student.gradeHistory || [])].filter((h) => h.academicYear !== liveYear);
    const hasLiveData =
      (student.trimesterGrades || []).length > 0 || (student.disciplineGrades || []).length > 0;
    if (hasLiveData) {
      history.push({
        academicYear: liveYear,
        className: student.className,
        grade: student.grade,
        trimesterGrades: student.trimesterGrades || [],
        disciplineGrades: student.disciplineGrades || [],
        finalAverage: student.currentAverage,
        archivedAt: new Date().toISOString()
      });
    }

    const restored = history.find((h) => h.academicYear === targetYear);
    student.gradeHistory = history.filter((h) => h.academicYear !== targetYear);
    student.trimesterGrades = restored?.trimesterGrades || [];
    student.disciplineGrades = restored?.disciplineGrades || [];
    student.currentAverage = restored?.finalAverage ?? 0;
    student.trimesterGradesYear = targetYear;
    return true;
  }

  /** Alinha as notas vivas de TODOS os alunos com o ano indicado (rollover / troca de ano). */
  private alignAllStudentGradesToYear(targetYear: string, previousYear?: string) {
    (this.db.students || []).forEach((st) => this.alignStudentGradesToYear(st, targetYear, previousYear));
  }

  // 3-Trimester Academic Records for Report Card
  public getStudentThreeTrimesterGrades(studentId: string, academicYear?: string): StudentTrimesterRecord[] {
    const student = (this.db?.students || []).find((s) => String(s.id) === String(studentId));
    if (!student) return [];

    // Ano Lectivo pedido diferente do ano "vivo": devolve apenas o que ficou arquivado nesse
    // ano (nunca as notas do ano corrente a passar por notas de outro ano).
    const currentYear = this.db.settings?.currentAcademicYear || '';
    if (academicYear && academicYear !== getLiveGradesYear(student, currentYear)) {
      const archived = getStudentArchiveForYear(student, academicYear)?.trimesterGrades || [];
      const archivedRules = normalizeGradeRules(this.db.settings?.gradeRules as any);
      return archived.map((rec) => {
        const mt1 = calculateMT(rec.mac1, rec.npp1, rec.npt1, archivedRules);
        const mt2 = calculateMT(rec.mac2, rec.npp2, rec.npt2, archivedRules);
        const mt3 = calculateMT(rec.mac3, rec.npp3, rec.npt3, archivedRules);
        const mfdCalc = calculateMFD(mt1, mt2, mt3, rec.pg ?? '', archivedRules);
        const mfd = typeof mfdCalc === 'number' ? mfdCalc : 0;
        return {
          ...rec,
          mt1: typeof mt1 === 'number' ? mt1 : 0,
          mt2: typeof mt2 === 'number' ? mt2 : 0,
          mt3: typeof mt3 === 'number' ? mt3 : 0,
          mfd,
          ca: calculateCA(mfd) as number
        };
      });
    }

    // 1. Return stored trimesterGrades if already available (real notes already homologadas/lançadas).
    //    Recalcula MT1/MT2/MT3/MFD a partir do MAC/NPP/NPT gravados em vez de confiar
    //    no mt1/mfd tal como está persistido — registos antigos/importados podiam ter
    //    ficado com mt1/mt2/mt3/mfd fixados em 0 apesar do MAC/NPP/NPT estarem lançados,
    //    fazendo o boletim mostrar médias erradas para sempre.
    if (student.trimesterGrades && student.trimesterGrades.length > 0) {
      const rules = normalizeGradeRules(this.db.settings?.gradeRules as any);
      return student.trimesterGrades.map((rec) => {
        const mt1 = calculateMT(rec.mac1, rec.npp1, rec.npt1, rules);
        const mt2 = calculateMT(rec.mac2, rec.npp2, rec.npt2, rules);
        const mt3 = calculateMT(rec.mac3, rec.npp3, rec.npt3, rules);
        const mfdCalc = calculateMFD(mt1, mt2, mt3, rec.pg ?? '', rules);
        const mfd = typeof mfdCalc === 'number' ? mfdCalc : 0;
        return {
          ...rec,
          mt1: typeof mt1 === 'number' ? mt1 : 0,
          mt2: typeof mt2 === 'number' ? mt2 : 0,
          mt3: typeof mt3 === 'number' ? mt3 : 0,
          mfd,
          ca: calculateCA(mfd) as number
        };
      });
    }

    // 2. Sem notas trimestrais guardadas ainda: procurar notas REALMENTE lançadas nas
    //    mini-pautas da turma do aluno, disciplina a disciplina. Nunca se inventam notas —
    //    um boletim de um aluno sem avaliações reais deve mostrar as disciplinas vazias,
    //    prontas a preencher, e não uma média "realista" fabricada.
    const classObj = (this.db?.classes || []).find(
      (c) => String(c.id) === String(student.classId) || c.name === student.className
    );
    const cycle = student.cycle || classObj?.cycle || '';

    const subjectsForCycle = (this.db.subjects || []).filter(
      (s) => !cycle || !s.cycle || s.cycle === cycle || s.cycle.includes('Secundário') || s.cycle.includes('Médio')
    );

    const records: StudentTrimesterRecord[] = [];

    subjectsForCycle.forEach((subj) => {
      const row = student.classId
        ? this.db.miniPautasStore?.[student.classId]?.[subj.id]?.find(
            (r: any) => String(r.studentId) === String(student.id) || String(r.num) === String(student.procNumber)
          )
        : null;

      // Só inclui a disciplina no boletim se existir pelo menos uma nota real lançada.
      const hasRealData =
        row &&
        (typeof row.mt1 === 'number' ||
          typeof row.mt2 === 'number' ||
          typeof row.mt3 === 'number' ||
          typeof row.mfd === 'number');
      if (!hasRealData) return;

      // Recalcula MT1/MT2/MT3/MFD a partir do MAC/NPP/NPT lançados na mini-pauta em
      // vez de confiar no mt1/mfd tal como está guardado (mesma correção do caso 1
      // acima) — evita médias "presas" em 0 no boletim do aluno.
      const rules = normalizeGradeRules(this.db.settings?.gradeRules as any);
      const mac1 = typeof row.mac1 === 'number' ? row.mac1 : 0;
      const npp1 = typeof row.npp1 === 'number' ? row.npp1 : 0;
      const npt1 = typeof row.npt1 === 'number' ? row.npt1 : 0;
      const mac2 = typeof row.mac2 === 'number' ? row.mac2 : 0;
      const npp2 = typeof row.npp2 === 'number' ? row.npp2 : 0;
      const npt2 = typeof row.npt2 === 'number' ? row.npt2 : 0;
      const mac3 = typeof row.mac3 === 'number' ? row.mac3 : 0;
      const npp3 = typeof row.npp3 === 'number' ? row.npp3 : 0;
      const npt3 = typeof row.npt3 === 'number' ? row.npt3 : 0;
      let mt1Calc: number | '' = calculateMT(mac1, npp1, npt1, rules);
      let mt2Calc: number | '' = calculateMT(mac2, npp2, npt2, rules);
      let mt3Calc: number | '' = calculateMT(mac3, npp3, npt3, rules);
      const impAvg = importedAveragesOf(findStudentSubjectRecord(student, String(subj.id), subj.name));
      if (impAvg) {
        if (mt1Calc === '' && typeof impAvg.mts[0] === 'number') mt1Calc = impAvg.mts[0];
        if (mt2Calc === '' && typeof impAvg.mts[1] === 'number') mt2Calc = impAvg.mts[1];
        if (mt3Calc === '' && typeof impAvg.mts[2] === 'number') mt3Calc = impAvg.mts[2];
      }
      const mfdCalc = calculateMFD(mt1Calc, mt2Calc, mt3Calc, row.pg, rules);
      const mfd = typeof mfdCalc === 'number' ? mfdCalc : (impAvg && typeof impAvg.mfd === 'number' ? impAvg.mfd : 0);
      records.push({
        subjectId: subj.id,
        subjectName: subj.name,
        mac1, npp1, npt1, mt1: typeof mt1Calc === 'number' ? mt1Calc : 0,
        mac2, npp2, npt2, mt2: typeof mt2Calc === 'number' ? mt2Calc : 0,
        mac3, npp3, npt3, mt3: typeof mt3Calc === 'number' ? mt3Calc : 0,
        mfd,
        pg: typeof row.pg === 'number' ? row.pg : undefined,
        ca: calculateCA(mfd) as number,
        situation: row.isDesistente ? 'Desistente' : (mfd >= 10 ? 'Aprovado' : 'Exame de Recurso')
      });
    });

    // Nunca persistir notas fabricadas na base de dados: apenas devolve o que existe
    // realmente lançado. Se `records` ficar vazio, o boletim deve indicar "Sem notas lançadas".
    return records;
  }

  // 4. Assiduidade REAL do Ano Letivo para o Boletim (nunca fabricada).
  // Carga horária prevista = nº de Tempos Lectivos semanais da turma (Horário/TimetableEntry)
  // x nº de semanas letivas configuradas em Configurações > Ano Letivo (trimesterSchedules / academicWeeks).
  // Presenças/Faltas = contagem real de status por aluno em todas as AttendanceSheet gravadas para a turma.
  public getStudentAttendanceSummary(studentId: string): {
    scheduledLessonsPerWeek: number;
    totalAcademicWeeks: number;
    totalScheduledLessons: number;
    presences: number;
    excusedAbsences: number;
    unexcusedAbsences: number;
    totalRecordedLessons: number;
    attendanceRatePercent: number;
  } {
    const student = (this.db?.students || []).find((s) => String(s.id) === String(studentId));

    const empty = {
      scheduledLessonsPerWeek: 0,
      totalAcademicWeeks: 0,
      totalScheduledLessons: 0,
      presences: 0,
      excusedAbsences: 0,
      unexcusedAbsences: 0,
      totalRecordedLessons: 0,
      attendanceRatePercent: 0
    };
    if (!student) return empty;

    // Carga horária prevista: nº real de Tempos Lectivos/semana alocados à turma no Horário.
    const classId = student.classId;
    const scheduledLessonsPerWeek = (this.db.timetable || []).filter(
      (t) => String(t.classId) === String(classId)
    ).length;

    // Nº real de semanas letivas configuradas (soma das 3 semanas dos trimestres; recorre a
    // "academicWeeks" apenas se as semanas por trimestre não estiverem configuradas).
    const schedules = this.db.settings?.trimesterSchedules;
    let totalAcademicWeeks = 0;
    if (schedules) {
      totalAcademicWeeks = ([schedules.t1, schedules.t2, schedules.t3] as any[]).reduce(
        (sum, t) => sum + (Number(t?.weeksCountNumber) || parseWeeksLabel(t?.weeksCount)),
        0
      );
    }
    if (!totalAcademicWeeks) {
      totalAcademicWeeks =
        Number(this.db.settings?.academicWeeksNumber) || parseWeeksLabel(this.db.settings?.academicWeeks);
    }

    const totalScheduledLessons = scheduledLessonsPerWeek * totalAcademicWeeks;

    // Contagem real de presenças/faltas nas cadernetas (AttendanceSheet) já gravadas para a turma.
    let presences = 0;
    let excusedAbsences = 0;
    let unexcusedAbsences = 0;

    (this.db.attendanceSheets || []).forEach((sheet) => {
      if (String(sheet.classId) !== String(classId)) return;
      const rec = (sheet.students || []).find(
        (st) => String(st.studentId) === String(studentId)
      );
      if (!rec) return;
      if (rec.status === 'P' || rec.status === 'A') presences += 1;
      else if (rec.status === 'FJ') excusedAbsences += 1;
      else if (rec.status === 'FI') unexcusedAbsences += 1;
    });

    const totalRecordedLessons = presences + excusedAbsences + unexcusedAbsences;

    // Se ainda não há cadernetas suficientes gravadas, não fabricamos uma percentagem: usamos
    // o que existe realmente lançado; só como último recurso aproveitamos o valor histórico
    // já guardado no cadastro do aluno (nunca um valor fixo tipo "95").
    const attendanceRatePercent =
      totalRecordedLessons > 0
        ? Math.round((presences / totalRecordedLessons) * 1000) / 10
        : Number(student.attendanceRate) || 0;

    return {
      scheduledLessonsPerWeek,
      totalAcademicWeeks,
      totalScheduledLessons,
      presences,
      excusedAbsences,
      unexcusedAbsences,
      totalRecordedLessons,
      attendanceRatePercent
    };
  }

  // 5. Apreciação real do Conselho de Turma — preenchida manualmente pelo Diretor de Turma,
  // nunca gerada automaticamente a partir da média do aluno.
  public updateStudentCouncilAppreciation(studentId: string, text: string, updatedByName?: string) {
    const targetStudent = (this.db.students || []).find((s) => String(s.id) === String(studentId));

    this.db.students = this.db.students.map((s) => {
      if (String(s.id) !== String(studentId)) return s;
      return {
        ...s,
        councilAppreciation: text,
        councilAppreciationUpdatedBy: updatedByName || this.db.currentUser?.name || 'Diretor de Turma',
        councilAppreciationUpdatedAt: new Date().toISOString()
      };
    });

    this.addAuditLog({
      userName: updatedByName || this.db.currentUser?.name || 'Diretor de Turma',
      userRole: this.db.currentUser?.roleTitle || 'Diretor de Turma',
      action: 'Apreciação do Conselho de Turma',
      details: `Apreciação do Conselho de Turma atualizada para o aluno ${
        targetStudent?.name || studentId
      }.`,
      module: 'alunos',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });

    // Atualiza de imediato o lembrete do Diretor de Turma responsável por esta turma
    // (remove a notificação se já não houver mais nenhum aluno por avaliar).
    const relatedClass = (this.db.classes || []).find(
      (c) =>
        (targetStudent?.classId && c.id === targetStudent.classId) ||
        (targetStudent?.className && c.name === targetStudent.className)
    );
    if (relatedClass?.headTeacherId) {
      this.syncCouncilAppreciationReminders(relatedClass.headTeacherId);
    }

    this.notify();
  }

  /** Turmas que o utilizador indicado coordena como Diretor de Turma (Chefe de Turma). */
  public getClassesCoordinatedBy(userId: string): ClassRoom[] {
    if (!userId) return [];
    const teacherId = this.resolveTeacherIdForUser(userId);
    if (!teacherId) return [];
    return (this.db.classes || []).filter((c) => String(c.headTeacherId) === String(teacherId));
  }

  /** Resolve o id do registo de Professor (db.teachers) a partir do id de um
   * utilizador — através do vínculo `linkedTeacherId` — aceitando também, por
   * conveniência, que já lhe seja passado diretamente um id de Professor. */
  private resolveTeacherIdForUser(userId: string): string | undefined {
    const user = (this.db.users || []).find((u) => String(u.id) === String(userId));
    if (user?.linkedTeacherId) return user.linkedTeacherId;
    const asTeacher = (this.db.teachers || []).find((t) => String(t.id) === String(userId));
    return asTeacher?.id;
  }

  /** Alunos das turmas coordenadas pelo utilizador (Diretor de Turma) cujo boletim
   * ainda não tem a Apreciação do Conselho de Turma preenchida — usado no Mural de
   * Avisos e na notificação em tempo real do cabeçalho, para que o Diretor de Turma
   * nunca se esqueça de dar o seu parecer. */
  public getStudentsMissingCouncilAppreciation(userId: string): Student[] {
    const classes = this.getClassesCoordinatedBy(userId);
    if (classes.length === 0) return [];
    const classIds = new Set(classes.map((c) => c.id));
    const classNames = new Set(classes.map((c) => c.name));
    return (this.db.students || []).filter(
      (s) =>
        s.status === 'active' &&
        (classIds.has(s.classId) || classNames.has(s.className)) &&
        !String(s.councilAppreciation || '').trim()
    );
  }

  /** Mantém, em tempo real, o lembrete no sino de notificações (cabeçalho) para o
   * Diretor de Turma com alunos por avaliar. É idempotente: só grava uma nova
   * notificação quando a lista de alunos em falta muda de facto, para não reabrir
   * como "não lida" a cada novo carregamento; e remove o lembrete assim que deixar
   * de haver alunos pendentes. */
  public syncCouncilAppreciationReminders(userId: string): void {
    if (!userId) return;
    const notifId = `council-appr-${userId}`;
    const missing = this.getStudentsMissingCouncilAppreciation(userId);
    const existing = (this.db.notifications || []).find((n) => n.id === notifId);

    if (missing.length === 0) {
      if (existing) this.deleteNotification(notifId);
      return;
    }

    const names = missing.map((s) => s.name);
    const message =
      missing.length === 1
        ? `${names[0]} aguarda a sua Apreciação do Conselho de Turma no boletim.`
        : `${missing.length} alunos aguardam a sua Apreciação do Conselho de Turma: ${names
            .slice(0, 3)
            .join(', ')}${missing.length > 3 ? '…' : ''}.`;

    if (existing && existing.message === message) return;

    this.addNotification({
      id: notifId,
      title: 'Apreciação do Conselho de Turma pendente',
      message,
      type: 'academic',
      priority: 'alta',
      targetRoles: ['professor'],
      targetUserId: userId,
      linkView: 'mural_biblioteca',
      linkId: userId
    });
  }

  // =========================================================================
  // RECURSOS HUMANOS → 1. FOLHA DE PAGAMENTO
  // =========================================================================

  public getPayrollRecords(): PayrollRecord[] {
    return this.db.payrollRecords || [];
  }

  public getPayrollEligiblePeople() {
    return listEligiblePeople(this.db);
  }

  /** Gera (ou regenera, se ainda pendente) o recibo de um mês/ano para uma pessoa. */
  public generatePayrollRecord(input: {
    personId: string;
    referenceMonth: number;
    referenceYear: number;
    allowancesOverrideKz?: number;
    bonusKz?: number;
    bonusDescription?: string;
    otherDeductionsKz?: number;
    otherDeductionsDescription?: string;
    notes?: string;
  }): { success: boolean; error?: string; record?: PayrollRecord } {
    const person = listEligiblePeople(this.db).find((p) => p.id === input.personId);
    if (!person) return { success: false, error: 'Docente ou funcionário não encontrado.' };
    if (!input.referenceMonth || input.referenceMonth < 1 || input.referenceMonth > 12) {
      return { success: false, error: 'Mês de referência inválido.' };
    }
    if (!input.referenceYear) return { success: false, error: 'Ano de referência inválido.' };

    const existing = (this.db.payrollRecords || []).find(
      (r) => r.personId === input.personId && r.referenceMonth === input.referenceMonth && r.referenceYear === input.referenceYear
    );
    if (existing && existing.status === 'pago') {
      return { success: false, error: 'Este recibo já foi pago — cancele o pagamento antes de o regenerar.' };
    }

    const tax = getEffectivePayrollTaxSettings(this.db);
    const baseSalaryKz = person.baseSalaryKz || 0;
    const allowancesKz = input.allowancesOverrideKz != null ? input.allowancesOverrideKz : person.allowancesKz || 0;
    const bonusKz = input.bonusKz || 0;
    const otherDeductionsKz = input.otherDeductionsKz || 0;

    const computed = computePayroll({ baseSalaryKz, allowancesKz, bonusKz, otherDeductionsKz }, tax);
    const now = new Date().toISOString();

    const record: PayrollRecord = {
      id: existing?.id || `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personId: person.id,
      personType: person.type,
      personName: person.name,
      personRole: person.role,
      department: person.department,
      academicYear: this.db.settings?.currentAcademicYear || '',
      referenceMonth: input.referenceMonth,
      referenceYear: input.referenceYear,
      baseSalaryKz,
      allowancesKz,
      allowanceDescription: person.allowanceDescription,
      bonusKz,
      bonusDescription: input.bonusDescription,
      otherDeductionsKz,
      otherDeductionsDescription: input.otherDeductionsDescription,
      grossSalaryKz: computed.grossSalaryKz,
      inssEmployeeKz: computed.inssEmployeeKz,
      irtKz: computed.irtKz,
      netSalaryKz: computed.netSalaryKz,
      status: 'pendente',
      bankName: person.bankName,
      iban: person.iban,
      generatedAt: now,
      generatedByName: this.currentActorName(),
      notes: input.notes
    };

    this.db.payrollRecords = existing
      ? (this.db.payrollRecords || []).map((r) => (r.id === existing.id ? record : r))
      : [record, ...(this.db.payrollRecords || [])];

    this.addAuditLog({
      userName: this.currentActorName(),
      action: existing ? 'Recibo de Vencimento Recalculado' : 'Recibo de Vencimento Gerado',
      details: `Recibo de ${person.name} referente a ${record.referenceMonth}/${record.referenceYear} — líquido ${record.netSalaryKz.toLocaleString('pt-PT')} Kz.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    } as any);

    this.notify();
    return { success: true, record };
  }

  /** Gera recibos em lote para todas as pessoas elegíveis que ainda não têm recibo nesse mês. */
  public bulkGeneratePayroll(referenceMonth: number, referenceYear: number): { generated: number; skipped: number } {
    const people = listEligiblePeople(this.db);
    let generated = 0;
    let skipped = 0;
    people.forEach((person) => {
      const existing = (this.db.payrollRecords || []).find(
        (r) => r.personId === person.id && r.referenceMonth === referenceMonth && r.referenceYear === referenceYear
      );
      if (existing) {
        skipped += 1;
        return;
      }
      const result = this.generatePayrollRecord({ personId: person.id, referenceMonth, referenceYear });
      if (result.success) generated += 1;
      else skipped += 1;
    });
    return { generated, skipped };
  }

  public markPayrollPaid(
    id: string,
    paymentMethod: PayrollRecord['paymentMethod'],
    paymentDate?: string
  ): { success: boolean; error?: string } {
    const record = (this.db.payrollRecords || []).find((r) => r.id === id);
    if (!record) return { success: false, error: 'Recibo não encontrado.' };
    if (record.status === 'pago') return { success: false, error: 'Este recibo já está marcado como pago.' };

    this.db.payrollRecords = (this.db.payrollRecords || []).map((r) =>
      r.id === id
        ? { ...r, status: 'pago', paymentMethod, paymentDate: paymentDate || new Date().toISOString().slice(0, 10), paidByName: this.currentActorName() }
        : r
    );

    this.addAuditLog({
      userName: this.currentActorName(),
      action: 'Pagamento de Salário Confirmado',
      details: `Pagamento confirmado para ${record.personName} — ${record.referenceMonth}/${record.referenceYear}.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#166534'
    } as any);

    this.notify();
    return { success: true };
  }

  public cancelPayrollRecord(id: string, reason?: string): { success: boolean; error?: string } {
    const record = (this.db.payrollRecords || []).find((r) => r.id === id);
    if (!record) return { success: false, error: 'Recibo não encontrado.' };

    this.db.payrollRecords = (this.db.payrollRecords || []).map((r) =>
      r.id === id
        ? { ...r, status: 'cancelado', cancelledByName: this.currentActorName(), cancelledAt: new Date().toISOString(), notes: reason || r.notes }
        : r
    );

    this.addAuditLog({
      userName: this.currentActorName(),
      action: 'Recibo de Vencimento Cancelado',
      details: `Recibo de ${record.personName} (${record.referenceMonth}/${record.referenceYear}) cancelado.${reason ? ` Motivo: ${reason}` : ''}`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#b91c1c'
    } as any);

    this.notify();
    return { success: true };
  }

  public deletePayrollRecord(id: string): { success: boolean; error?: string } {
    const record = (this.db.payrollRecords || []).find((r) => r.id === id);
    if (!record) return { success: false, error: 'Recibo não encontrado.' };
    if (record.status === 'pago') return { success: false, error: 'Não é possível eliminar um recibo já pago — cancele-o primeiro.' };
    this.db.payrollRecords = (this.db.payrollRecords || []).filter((r) => r.id !== id);
    this.notify();
    return { success: true };
  }

  public getPayrollTaxSettings() {
    return getEffectivePayrollTaxSettings(this.db);
  }

  public savePayrollTaxSettings(settings: InstitutionSettings['payrollTaxSettings']): { success: boolean } {
    this.db.settings = { ...this.db.settings, payrollTaxSettings: settings };
    this.notify();
    return { success: true };
  }

  // =========================================================================
  // RECURSOS HUMANOS → 2. AVALIAÇÃO DE DESEMPENHO DOCENTE
  // =========================================================================

  public getTeacherEvaluations(): TeacherEvaluation[] {
    return this.db.teacherEvaluations || [];
  }

  public getDefaultEvaluationCriteria(teacherId: string): { success: boolean; error?: string; criteria?: TeacherEvaluationCriterionScore[] } {
    const teacher = (this.db.teachers || []).find((t) => t.id === teacherId);
    if (!teacher) return { success: false, error: 'Professor não encontrado.' };
    return { success: true, criteria: buildDefaultCriteria(teacher, this.db) };
  }

  public saveTeacherEvaluation(input: {
    id?: string;
    teacherId: string;
    period: string;
    criteria: TeacherEvaluationCriterionScore[];
    strengths?: string;
    areasToImprove?: string;
    developmentPlan?: string;
    status: TeacherEvaluation['status'];
  }): { success: boolean; error?: string; evaluation?: TeacherEvaluation } {
    const teacher = (this.db.teachers || []).find((t) => t.id === input.teacherId);
    if (!teacher) return { success: false, error: 'Professor não encontrado.' };
    if (!input.period?.trim()) return { success: false, error: 'Indique o período da avaliação.' };
    if (!input.criteria || input.criteria.length === 0) return { success: false, error: 'A avaliação precisa de pelo menos um critério.' };

    const finalScore = computeFinalScore(input.criteria);
    const classification = classifyScore(finalScore);
    const now = new Date().toISOString();
    const academicYear = this.db.settings?.currentAcademicYear || '';

    if (input.id) {
      const current = (this.db.teacherEvaluations || []).find((e) => e.id === input.id);
      if (!current) return { success: false, error: 'Avaliação não encontrada.' };
      if (current.status === 'homologada') return { success: false, error: 'Uma avaliação homologada não pode ser editada.' };
      const updated: TeacherEvaluation = {
        ...current,
        period: input.period,
        criteria: input.criteria,
        finalScore,
        classification,
        strengths: input.strengths,
        areasToImprove: input.areasToImprove,
        developmentPlan: input.developmentPlan,
        status: input.status,
        updatedAt: now
      };
      this.db.teacherEvaluations = (this.db.teacherEvaluations || []).map((e) => (e.id === input.id ? updated : e));
      this.notify();
      return { success: true, evaluation: updated };
    }

    const created: TeacherEvaluation = {
      id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      teacherId: teacher.id,
      teacherName: teacher.name,
      department: teacher.department,
      academicYear,
      period: input.period,
      evaluatorName: this.currentActorName(),
      evaluationDate: now.slice(0, 10),
      criteria: input.criteria,
      finalScore,
      classification,
      strengths: input.strengths,
      areasToImprove: input.areasToImprove,
      developmentPlan: input.developmentPlan,
      status: input.status,
      createdAt: now
    };

    this.db.teacherEvaluations = [created, ...(this.db.teacherEvaluations || [])];

    this.addAuditLog({
      userName: this.currentActorName(),
      action: 'Avaliação de Desempenho Docente Registada',
      details: `Avaliação de ${teacher.name} (${input.period}) — nota final ${finalScore.toFixed(2)} (${classification}).`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    } as any);

    this.notify();
    return { success: true, evaluation: created };
  }

  public homologateTeacherEvaluation(id: string): { success: boolean; error?: string } {
    const evaluation = (this.db.teacherEvaluations || []).find((e) => e.id === id);
    if (!evaluation) return { success: false, error: 'Avaliação não encontrada.' };
    if (evaluation.status === 'homologada') return { success: false, error: 'Esta avaliação já está homologada.' };

    this.db.teacherEvaluations = (this.db.teacherEvaluations || []).map((e) =>
      e.id === id ? { ...e, status: 'homologada', updatedAt: new Date().toISOString() } : e
    );

    this.addAuditLog({
      userName: this.currentActorName(),
      action: 'Avaliação de Desempenho Docente Homologada',
      details: `Avaliação de ${evaluation.teacherName} (${evaluation.period}) homologada.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#166534'
    } as any);

    this.notify();
    return { success: true };
  }

  public deleteTeacherEvaluation(id: string): { success: boolean; error?: string } {
    const evaluation = (this.db.teacherEvaluations || []).find((e) => e.id === id);
    if (!evaluation) return { success: false, error: 'Avaliação não encontrada.' };
    if (evaluation.status === 'homologada') return { success: false, error: 'Uma avaliação homologada não pode ser eliminada.' };
    this.db.teacherEvaluations = (this.db.teacherEvaluations || []).filter((e) => e.id !== id);
    this.notify();
    return { success: true };
  }

  // =========================================================================
  // RECURSOS HUMANOS → 3. FÉRIAS & LICENÇAS
  // =========================================================================

  public getLeaveRequests(): LeaveRequest[] {
    return this.db.leaveRequests || [];
  }

  public getLeaveEligiblePeople() {
    return listLeaveEligiblePeople(this.db);
  }

  public createLeaveRequest(input: {
    personId: string;
    type: LeaveRequest['type'];
    typeDescription?: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }): { success: boolean; error?: string; request?: LeaveRequest } {
    const person = listLeaveEligiblePeople(this.db).find((p) => p.id === input.personId);
    if (!person) return { success: false, error: 'Docente ou funcionário não encontrado.' };
    if (!input.startDate || !input.endDate) return { success: false, error: 'Indique a data de início e de fim.' };
    if (input.endDate < input.startDate) return { success: false, error: 'A data de fim não pode ser anterior à data de início.' };
    if (input.type === 'outro' && !input.typeDescription?.trim()) {
      return { success: false, error: 'Descreva o tipo de licença quando escolher "Outro".' };
    }
    if (hasOverlappingLeave(input.personId, input.startDate, input.endDate, this.db.leaveRequests || [])) {
      return { success: false, error: 'Já existe um pedido pendente ou aprovado para esta pessoa que se sobrepõe a estas datas.' };
    }

    const now = new Date().toISOString();
    const created: LeaveRequest = {
      id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personId: person.id,
      personType: person.type,
      personName: person.name,
      personRole: person.role,
      department: person.department,
      type: input.type,
      typeDescription: input.typeDescription,
      startDate: input.startDate,
      endDate: input.endDate,
      workingDaysCount: countWorkingDays(input.startDate, input.endDate),
      reason: input.reason,
      status: 'pendente',
      academicYear: this.db.settings?.currentAcademicYear || '',
      requestedAt: now,
      requestedByName: this.currentActorName()
    };

    this.db.leaveRequests = [created, ...(this.db.leaveRequests || [])];

    this.addAuditLog({
      userName: this.currentActorName(),
      action: 'Pedido de Férias/Licença Registado',
      details: `${person.name} — ${created.type} de ${created.startDate} a ${created.endDate} (${created.workingDaysCount} dia(s) úteis).`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    } as any);

    this.notify();
    return { success: true, request: created };
  }

  public decideLeaveRequest(
    id: string,
    decision: 'aprovado' | 'rejeitado',
    decisionNotes?: string
  ): { success: boolean; error?: string } {
    const request = (this.db.leaveRequests || []).find((r) => r.id === id);
    if (!request) return { success: false, error: 'Pedido não encontrado.' };
    if (request.status !== 'pendente') return { success: false, error: 'Este pedido já foi decidido.' };

    this.db.leaveRequests = (this.db.leaveRequests || []).map((r) =>
      r.id === id
        ? { ...r, status: decision, decidedByName: this.currentActorName(), decidedAt: new Date().toISOString(), decisionNotes }
        : r
    );

    this.addAuditLog({
      userName: this.currentActorName(),
      action: decision === 'aprovado' ? 'Pedido de Férias/Licença Aprovado' : 'Pedido de Férias/Licença Rejeitado',
      details: `${request.personName} — ${request.startDate} a ${request.endDate}.${decisionNotes ? ` Nota: ${decisionNotes}` : ''}`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: decision === 'aprovado' ? '#166534' : '#b91c1c'
    } as any);

    this.notify();
    return { success: true };
  }

  public completeLeaveRequest(id: string): { success: boolean; error?: string } {
    const request = (this.db.leaveRequests || []).find((r) => r.id === id);
    if (!request) return { success: false, error: 'Pedido não encontrado.' };
    if (request.status !== 'aprovado') return { success: false, error: 'Só um pedido aprovado pode ser marcado como concluído.' };
    this.db.leaveRequests = (this.db.leaveRequests || []).map((r) => (r.id === id ? { ...r, status: 'concluido' } : r));
    this.notify();
    return { success: true };
  }

  public cancelLeaveRequest(id: string, reason?: string): { success: boolean; error?: string } {
    const request = (this.db.leaveRequests || []).find((r) => r.id === id);
    if (!request) return { success: false, error: 'Pedido não encontrado.' };
    if (request.status === 'concluido') return { success: false, error: 'Um pedido já concluído não pode ser cancelado.' };
    this.db.leaveRequests = (this.db.leaveRequests || []).map((r) =>
      r.id === id ? { ...r, status: 'cancelado', decisionNotes: reason || r.decisionNotes, decidedByName: this.currentActorName(), decidedAt: new Date().toISOString() } : r
    );
    this.notify();
    return { success: true };
  }

  public deleteLeaveRequest(id: string): { success: boolean; error?: string } {
    const request = (this.db.leaveRequests || []).find((r) => r.id === id);
    if (!request) return { success: false, error: 'Pedido não encontrado.' };
    this.db.leaveRequests = (this.db.leaveRequests || []).filter((r) => r.id !== id);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Comunicação — 2. Notificações SMS/WhatsApp, 3. Reuniões Pais-Professores
  // ------------------------------------------------------------------
  private comunicacaoAudit(action: string, details: string, badgeColor = '#0b1f3a') {
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action,
      details,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor
    });
  }

  private newComunicacaoId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ---------- 2. Notificações SMS/WhatsApp ----------

  public getSmsWhatsappNotifications(): SmsWhatsappNotification[] {
    return this.db.smsWhatsappNotifications || [];
  }

  public saveNotificationDraft(
    input: { id?: string } & NotificationFieldsInput
  ): { success: boolean; error?: string; errors?: string[]; notification?: SmsWhatsappNotification } {
    const errors = validateNotification(input);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const students = this.db.students || [];
    const className = input.classId ? (this.db.classes || []).find((c) => String(c.id) === String(input.classId))?.name : undefined;
    const now = new Date().toISOString();

    if (input.id) {
      const current = (this.db.smsWhatsappNotifications || []).find((n) => n.id === input.id);
      if (!current) return { success: false, error: 'Notificação não encontrada.' };
      if (current.status !== 'rascunho' && current.status !== 'agendada') {
        return { success: false, error: 'Só é possível editar notificações em rascunho ou agendadas.' };
      }
      const updated: SmsWhatsappNotification = {
        ...current,
        channel: input.channel,
        audienceType: input.audienceType,
        classId: input.classId,
        className,
        studentIds: input.studentIds,
        title: input.title.trim(),
        message: input.message.trim(),
        scheduledFor: input.scheduledFor || undefined,
        status: input.scheduledFor ? 'agendada' : 'rascunho'
      };
      this.db.smsWhatsappNotifications = (this.db.smsWhatsappNotifications || []).map((n) => (n.id === input.id ? updated : n));
      this.notify();
      return { success: true, notification: updated };
    }

    const created: SmsWhatsappNotification = {
      id: this.newComunicacaoId('notif'),
      code: generateNotificationCode((this.db.smsWhatsappNotifications || []).map((n) => n.code)),
      channel: input.channel,
      audienceType: input.audienceType,
      classId: input.classId,
      className,
      studentIds: input.studentIds,
      title: input.title.trim(),
      message: input.message.trim(),
      status: input.scheduledFor ? 'agendada' : 'rascunho',
      scheduledFor: input.scheduledFor || undefined,
      recipients: [],
      sentCount: 0,
      failedCount: 0,
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.smsWhatsappNotifications = [created, ...(this.db.smsWhatsappNotifications || [])];
    this.notify();
    return { success: true, notification: created };
  }

  /**
   * "Envia" a notificação: constrói a lista de destinatários a partir do
   * público-alvo e regista o resultado.
   *
   * - Canal SMS: continua simulado (sem integração configurada com
   *   operadora/gateway) — a entrega é registada como bem-sucedida de
   *   imediato para todos os destinatários com telefone válido.
   * - Canal WhatsApp (ou "Ambos"): o envio é REAL, através do mecanismo
   *   oficial do WhatsApp (wa.me). Por isso os destinatários com telefone
   *   válido ficam com estado "pendente" — cada mensagem só fica
   *   efetivamente "entregue" quando o operador a despachar na fila de
   *   envio (abrindo o WhatsApp e premindo "Enviar"), através de
   *   markWhatsAppRecipientSent(). Destinatários sem telefone utilizável
   *   para WhatsApp ficam marcados como "falhou".
   */
  public sendNotification(id: string): { success: boolean; error?: string; notification?: SmsWhatsappNotification } {
    const current = (this.db.smsWhatsappNotifications || []).find((n) => n.id === id);
    if (!current) return { success: false, error: 'Notificação não encontrada.' };
    if (current.status === 'enviada') return { success: false, error: 'Esta notificação já foi enviada.' };

    const recipients = buildRecipientsForAudience(
      current.audienceType,
      this.db.students || [],
      this.db.teachers || [],
      this.db.funcionarios || [],
      current.classId,
      current.studentIds
    );

    if (recipients.length === 0) {
      const failed: SmsWhatsappNotification = { ...current, status: 'falhada', recipients: [], sentCount: 0, failedCount: 0 };
      this.db.smsWhatsappNotifications = (this.db.smsWhatsappNotifications || []).map((n) => (n.id === id ? failed : n));
      this.notify();
      return { success: false, error: 'Não foram encontrados destinatários com telefone válido para o público-alvo escolhido.' };
    }

    const usesWhatsApp = current.channel === 'whatsapp' || current.channel === 'ambos';
    const delivered = recipients.map((r) => {
      if (!usesWhatsApp) return { ...r, deliveryStatus: 'entregue' as const };
      // WhatsApp real: aguarda despacho manual (fila de envio) por cada destinatário.
      return normalizeWhatsAppPhone(r.phone)
        ? { ...r, deliveryStatus: 'pendente' as const }
        : { ...r, deliveryStatus: 'falhou' as const };
    });
    const sentCount = delivered.filter((r) => r.deliveryStatus === 'entregue').length;
    const failedCount = delivered.filter((r) => r.deliveryStatus === 'falhou').length;
    const updated: SmsWhatsappNotification = {
      ...current,
      status: 'enviada',
      recipients: delivered,
      sentCount,
      failedCount,
      sentAt: new Date().toISOString()
    };
    this.db.smsWhatsappNotifications = (this.db.smsWhatsappNotifications || []).map((n) => (n.id === id ? updated : n));
    this.comunicacaoAudit(
      'Envio de Notificação em Massa',
      usesWhatsApp
        ? `Notificação "${updated.title}" (${updated.code}) preparada para envio real por ${CHANNEL_LABELS[updated.channel]} a ${delivered.length} destinatário(s) — ${AUDIENCE_TYPE_LABELS[updated.audienceType]}. Aguarda despacho individual na fila de envio do WhatsApp.`
        : `Notificação "${updated.title}" (${updated.code}) enviada por ${CHANNEL_LABELS[updated.channel]} a ${delivered.length} destinatário(s) — ${AUDIENCE_TYPE_LABELS[updated.audienceType]}.`
    );
    this.notify();
    return { success: true, notification: updated };
  }

  /**
   * Regista o despacho REAL de uma mensagem WhatsApp para um destinatário
   * específico: o operador abriu o link oficial wa.me (com a mensagem já
   * pré-preenchida) e premiu "Enviar" dentro do WhatsApp Web/Desktop ou da
   * app — a mensagem saiu efetivamente da conta de WhatsApp da escola/
   * operador, sem qualquer simulação. Atualiza o estado do destinatário e
   * os contadores da notificação.
   */
  public markWhatsAppRecipientSent(
    notificationId: string,
    recipientId: string
  ): { success: boolean; error?: string; notification?: SmsWhatsappNotification } {
    const current = (this.db.smsWhatsappNotifications || []).find((n) => n.id === notificationId);
    if (!current) return { success: false, error: 'Notificação não encontrada.' };
    const target = current.recipients.find((r) => r.id === recipientId);
    if (!target) return { success: false, error: 'Destinatário não encontrado nesta notificação.' };

    const nowIso = new Date().toISOString();
    const recipients = current.recipients.map((r) =>
      r.id === recipientId ? { ...r, deliveryStatus: 'entregue' as const, whatsappSentAt: nowIso } : r
    );
    const sentCount = recipients.filter((r) => r.deliveryStatus === 'entregue').length;
    const failedCount = recipients.filter((r) => r.deliveryStatus === 'falhou').length;
    const updated: SmsWhatsappNotification = { ...current, recipients, sentCount, failedCount };
    this.db.smsWhatsappNotifications = (this.db.smsWhatsappNotifications || []).map((n) => (n.id === notificationId ? updated : n));
    this.notify();
    return { success: true, notification: updated };
  }

  public deleteSmsWhatsappNotification(id: string): { success: boolean; error?: string } {
    const target = (this.db.smsWhatsappNotifications || []).find((n) => n.id === id);
    if (!target) return { success: false, error: 'Notificação não encontrada.' };
    this.db.smsWhatsappNotifications = (this.db.smsWhatsappNotifications || []).filter((n) => n.id !== id);
    this.notify();
    return { success: true };
  }

  // ---------- 3. Reuniões Pais-Professores ----------

  public getMeetings(): ParentTeacherMeeting[] {
    return this.db.parentTeacherMeetings || [];
  }

  public saveMeeting(
    input: { id?: string } & MeetingFieldsInput
  ): { success: boolean; error?: string; errors?: string[]; meeting?: ParentTeacherMeeting } {
    const errors = validateMeeting(input);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    const teacher = (this.db.teachers || []).find((t) => t.id === input.teacherId);
    if (!teacher) return { success: false, error: 'Professor não encontrado.' };
    const className = input.classId ? (this.db.classes || []).find((c) => String(c.id) === String(input.classId))?.name : undefined;
    const participants = buildMeetingParticipants(input.type, this.db.students || [], input.classId, input.studentIds);
    const now = new Date().toISOString();

    if (input.id) {
      const current = (this.db.parentTeacherMeetings || []).find((m) => m.id === input.id);
      if (!current) return { success: false, error: 'Reunião não encontrada.' };
      if (current.status !== 'agendada') return { success: false, error: 'Só uma reunião agendada pode ser editada.' };
      const updated: ParentTeacherMeeting = {
        ...current,
        type: input.type,
        title: input.title.trim(),
        teacherId: teacher.id,
        teacherName: teacher.name,
        classId: input.classId,
        className,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location?.trim() || undefined,
        agenda: input.agenda?.trim() || undefined,
        participants,
        updatedAt: now,
        updatedBy: this.currentActorName()
      };
      this.db.parentTeacherMeetings = (this.db.parentTeacherMeetings || []).map((m) => (m.id === input.id ? updated : m));
      this.notify();
      return { success: true, meeting: updated };
    }

    const created: ParentTeacherMeeting = {
      id: this.newComunicacaoId('reu'),
      code: generateMeetingCode((this.db.parentTeacherMeetings || []).map((m) => m.code)),
      type: input.type,
      title: input.title.trim(),
      teacherId: teacher.id,
      teacherName: teacher.name,
      classId: input.classId,
      className,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location?.trim() || undefined,
      agenda: input.agenda?.trim() || undefined,
      status: 'agendada',
      participants,
      createdBy: this.currentActorName(),
      createdAt: now
    };
    this.db.parentTeacherMeetings = [created, ...(this.db.parentTeacherMeetings || [])];
    this.comunicacaoAudit(
      'Agendamento de Reunião Pais-Professores',
      `Reunião "${created.title}" (${created.code}) agendada com ${created.teacherName} para ${created.date} — ${MEETING_STATUS_META[created.status].label}.`
    );
    this.notify();
    return { success: true, meeting: created };
  }

  public updateMeetingParticipantStatus(
    meetingId: string,
    studentId: string,
    status: MeetingParticipantStatus
  ): { success: boolean; error?: string } {
    const current = (this.db.parentTeacherMeetings || []).find((m) => m.id === meetingId);
    if (!current) return { success: false, error: 'Reunião não encontrada.' };
    this.db.parentTeacherMeetings = (this.db.parentTeacherMeetings || []).map((m) =>
      m.id === meetingId
        ? { ...m, participants: m.participants.map((p) => (p.studentId === studentId ? { ...p, status } : p)) }
        : m
    );
    this.notify();
    return { success: true };
  }

  public completeMeeting(id: string, summary: string): { success: boolean; error?: string } {
    const current = (this.db.parentTeacherMeetings || []).find((m) => m.id === id);
    if (!current) return { success: false, error: 'Reunião não encontrada.' };
    if (!summary.trim()) return { success: false, error: 'Escreva um resumo da reunião antes de a marcar como realizada.' };
    this.db.parentTeacherMeetings = (this.db.parentTeacherMeetings || []).map((m) =>
      m.id === id ? { ...m, status: 'realizada' as const, summary: summary.trim(), updatedAt: new Date().toISOString(), updatedBy: this.currentActorName() } : m
    );
    this.notify();
    return { success: true };
  }

  public cancelMeeting(id: string, reason?: string): { success: boolean; error?: string } {
    const current = (this.db.parentTeacherMeetings || []).find((m) => m.id === id);
    if (!current) return { success: false, error: 'Reunião não encontrada.' };
    this.db.parentTeacherMeetings = (this.db.parentTeacherMeetings || []).map((m) =>
      m.id === id ? { ...m, status: 'cancelada' as const, cancelReason: reason?.trim() || undefined, updatedAt: new Date().toISOString(), updatedBy: this.currentActorName() } : m
    );
    this.notify();
    return { success: true };
  }

  public deleteMeeting(id: string): { success: boolean; error?: string } {
    const target = (this.db.parentTeacherMeetings || []).find((m) => m.id === id);
    if (!target) return { success: false, error: 'Reunião não encontrada.' };
    this.db.parentTeacherMeetings = (this.db.parentTeacherMeetings || []).filter((m) => m.id !== id);
    this.notify();
    return { success: true };
  }

  // ---------- 5. Chat Interno (Escola ↔ Professor/Aluno/Funcionário/Encarregado) ----------
  //
  // Mensageria privada 1-para-1 ao estilo Messenger/Facebook: cada conversa só é
  // visível para os seus dois `participantIds`. Quem pode iniciar conversa com
  // quem é decidido na camada de UI (ver `utils/internalChat.ts`, que usa a
  // permissão `comunicacao.chat.manage`) — aqui ficam apenas as operações sobre
  // os dados, comuns a qualquer par de utilizadores autorizado.

  public getInternalChatThreads(): InternalChatThread[] {
    return this.db.internalChatThreads || [];
  }

  /** Conversas do utilizador indicado, mais recentes primeiro. */
  public getInternalChatThreadsForUser(userId: string): InternalChatThread[] {
    return (this.db.internalChatThreads || [])
      .filter((t) => t.participantIds.includes(userId))
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }

  /** Nº de mensagens não lidas do utilizador, em todas as suas conversas. */
  public getInternalChatUnreadCount(userId: string): number {
    return this.getInternalChatThreadsForUser(userId).reduce((total, thread) => {
      return total + thread.messages.filter((m) => m.senderId !== userId && !m.readBy.includes(userId)).length;
    }, 0);
  }

  /** Devolve a conversa já existente entre o utilizador atual e `other`, criando-a se ainda não existir. */
  public getOrCreateInternalChatThread(
    other: InternalChatParticipant
  ): { success: boolean; error?: string; thread?: InternalChatThread } {
    const me = this.db.currentUser;
    if (!me) return { success: false, error: 'Sessão não iniciada.' };
    if (me.id === other.id) return { success: false, error: 'Não é possível conversar consigo mesmo.' };

    const existing = (this.db.internalChatThreads || []).find(
      (t) => t.participantIds.includes(me.id) && t.participantIds.includes(other.id)
    );
    if (existing) return { success: true, thread: existing };

    const now = new Date().toISOString();
    const meParticipant: InternalChatParticipant = {
      id: me.id,
      name: me.name,
      role: me.role,
      roleTitle: me.roleTitle,
      avatar: me.avatar
    };
    const created: InternalChatThread = {
      id: this.newComunicacaoId('ichat'),
      participantIds: [me.id, other.id],
      participants: [meParticipant, other],
      messages: [],
      lastMessageAt: now,
      createdAt: now
    };
    this.db.internalChatThreads = [created, ...(this.db.internalChatThreads || [])];
    this.notify();
    return { success: true, thread: created };
  }

  /** Envia uma mensagem em nome do utilizador autenticado. */
  public sendInternalChatMessage(
    threadId: string,
    content: string
  ): { success: boolean; error?: string; thread?: InternalChatThread } {
    const me = this.db.currentUser;
    if (!me) return { success: false, error: 'Sessão não iniciada.' };
    if (!content.trim()) return { success: false, error: 'Escreva uma mensagem.' };

    const current = (this.db.internalChatThreads || []).find((t) => t.id === threadId);
    if (!current) return { success: false, error: 'Conversa não encontrada.' };
    if (!current.participantIds.includes(me.id)) return { success: false, error: 'Sem acesso a esta conversa.' };

    const now = new Date().toISOString();
    const message: InternalChatMessage = {
      id: this.newComunicacaoId('imsg'),
      senderId: me.id,
      senderName: me.name,
      senderRole: me.role,
      senderAvatar: me.avatar,
      content: content.trim(),
      timestamp: now,
      readBy: [me.id]
    };
    const updated: InternalChatThread = {
      ...current,
      messages: [...current.messages, message],
      lastMessageAt: now
    };
    this.db.internalChatThreads = (this.db.internalChatThreads || []).map((t) => (t.id === threadId ? updated : t));
    this.notify();
    return { success: true, thread: updated };
  }

  /** Marca como lidas, para o utilizador autenticado, todas as mensagens de uma conversa. */
  public markInternalChatThreadRead(threadId: string): { success: boolean; error?: string } {
    const me = this.db.currentUser;
    if (!me) return { success: false, error: 'Sessão não iniciada.' };
    const current = (this.db.internalChatThreads || []).find((t) => t.id === threadId);
    if (!current) return { success: false, error: 'Conversa não encontrada.' };
    if (!current.participantIds.includes(me.id)) return { success: false, error: 'Sem acesso a esta conversa.' };

    let changed = false;
    const messages = current.messages.map((m) => {
      if (m.readBy.includes(me.id)) return m;
      changed = true;
      return { ...m, readBy: [...m.readBy, me.id] };
    });
    if (!changed) return { success: true };

    this.db.internalChatThreads = (this.db.internalChatThreads || []).map((t) =>
      t.id === threadId ? { ...current, messages } : t
    );
    this.notify();
    return { success: true };
  }

  // =====================================================================
  // NOTA (Backup): o antigo agendador de backups no navegador
  // (runScheduledBackupIfDue + settings.backupHistory) foi REMOVIDO. As cópias
  // de segurança são agora um ficheiro .json que o administrador baixa e volta a carregar
  // (funções SQL school_backup_export / school_backup_restore, migração 0012) — painel em
  // Configurações → Segurança & Backups (SchoolRestorePoints).
  // =====================================================================

  // =====================================================================
  // Configurações 10. Política de Proteção de Dados Pessoais (Lei 22/11)
  // =====================================================================

  public getDataProtectionPolicy(): DataProtectionPolicy {
    return this.db.settings.dataProtectionPolicy || defaultDataProtectionPolicy();
  }

  public updateDataProtectionPolicy(partial: Partial<DataProtectionPolicy>): DataProtectionPolicy {
    const current = this.getDataProtectionPolicy();
    const updated: DataProtectionPolicy = { ...current, ...partial, lastReviewedIso: new Date().toISOString() };
    this.db.settings = { ...this.db.settings, dataProtectionPolicy: updated };
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action: 'Atualização da Política de Proteção de Dados',
      details: 'A política de proteção de dados pessoais da instituição foi revista e atualizada.',
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return updated;
  }

  public getDataSubjectRequests(): DataSubjectRequest[] {
    return this.db.dataSubjectRequests || [];
  }

  public createDataSubjectRequest(
    fields: DataSubjectRequestFieldsInput
  ): { success: boolean; error?: string; errors?: string[]; request?: DataSubjectRequest } {
    const errors = validateDataSubjectRequest(fields);
    if (errors.length > 0) return { success: false, errors, error: errors[0] };

    let studentName: string | undefined;
    if (fields.studentId) {
      const student = (this.db.students || []).find((s) => s.id === fields.studentId);
      studentName = student?.name;
    }

    const now = new Date().toISOString();
    const created: DataSubjectRequest = {
      id: this.newComunicacaoId('dsr'),
      code: generateDataSubjectRequestCode((this.db.dataSubjectRequests || []).map((r) => r.code)),
      requesterName: fields.requesterName.trim(),
      requesterRelation: fields.requesterRelation,
      studentId: fields.studentId,
      studentName,
      type: fields.type,
      description: fields.description?.trim() || undefined,
      status: 'pendente',
      requestedAt: now,
      createdBy: this.currentActorName()
    };
    this.db.dataSubjectRequests = [created, ...(this.db.dataSubjectRequests || [])];
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action: 'Registo de Pedido de Titular de Dados',
      details: `Pedido ${created.code} (${REQUEST_TYPE_LABELS[created.type]}) registado para ${created.requesterName}.`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true, request: created };
  }

  public updateDataSubjectRequestStatus(
    id: string,
    status: DataSubjectRequestStatus,
    resolutionNotes?: string
  ): { success: boolean; error?: string } {
    const current = (this.db.dataSubjectRequests || []).find((r) => r.id === id);
    if (!current) return { success: false, error: 'Pedido não encontrado.' };
    const isFinal = status === 'concluido' || status === 'rejeitado';
    const updated: DataSubjectRequest = {
      ...current,
      status,
      resolutionNotes: resolutionNotes?.trim() || current.resolutionNotes,
      resolvedAt: isFinal ? new Date().toISOString() : current.resolvedAt
    };
    this.db.dataSubjectRequests = (this.db.dataSubjectRequests || []).map((r) => (r.id === id ? updated : r));
    this.addAuditLog({
      userName: this.currentActorName(),
      userRole: this.db.currentUser?.roleTitle || 'Administrador',
      action: 'Atualização de Pedido de Titular de Dados',
      details: `Pedido ${current.code} passou para o estado "${REQUEST_STATUS_META[status].label}".`,
      module: 'sistema',
      timestamp: 'Agora mesmo',
      badgeColor: '#0b1f3a'
    });
    this.notify();
    return { success: true };
  }

  public deleteDataSubjectRequest(id: string): { success: boolean; error?: string } {
    const target = (this.db.dataSubjectRequests || []).find((r) => r.id === id);
    if (!target) return { success: false, error: 'Pedido não encontrado.' };
    this.db.dataSubjectRequests = (this.db.dataSubjectRequests || []).filter((r) => r.id !== id);
    this.notify();
    return { success: true };
  }

  // ==========================================
  // ENSINO SUPERIOR (MESCTI / ECTS)
  // ==========================================
  public saveUnidadeCurricular(uc: Partial<UnidadeCurricular>): UnidadeCurricular {
    const list = this.db.unidadesCurriculares || [];
    const id = uc.id || `uc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullUC: UnidadeCurricular = {
      id,
      code: uc.code || 'UC101',
      name: uc.name || 'Nova Unidade Curricular',
      shortName: uc.shortName,
      courseId: uc.courseId || '',
      courseName: uc.courseName || '',
      year: uc.year || 1,
      semester: uc.semester || 1,
      creditsECTS: uc.creditsECTS || 6,
      totalHours: uc.totalHours || 90,
      contactHours: uc.contactHours || { teorica: 30, pratica: 30, teoricoPratica: 30, laboratorial: 0 },
      autonomousHours: uc.autonomousHours || 60,
      type: uc.type || 'obrigatoria',
      prerequisites: uc.prerequisites || [],
      prerequisiteNames: uc.prerequisiteNames,
      department: uc.department,
      syllabus: uc.syllabus,
      academicYear: uc.academicYear || this.db.settings?.currentAcademicYear || '',
      status: uc.status || 'ativo'
    };
    const exists = list.some((item) => item.id === id);
    this.db.unidadesCurriculares = exists
      ? list.map((item) => (item.id === id ? fullUC : item))
      : [...list, fullUC];
    this.notify();
    return fullUC;
  }

  public deleteUnidadeCurricular(id: string): boolean {
    const list = this.db.unidadesCurriculares || [];
    this.db.unidadesCurriculares = list.filter((u) => u.id !== id);
    this.notify();
    return true;
  }

  public saveInscricaoUC(insc: Partial<InscricaoUC>): InscricaoUC {
    const list = this.db.inscricoesUC || [];
    const id = insc.id || `insc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullInsc: InscricaoUC = {
      id,
      studentId: insc.studentId || '',
      studentName: insc.studentName || '',
      studentProcNumber: insc.studentProcNumber || '',
      courseId: insc.courseId || '',
      courseName: insc.courseName || '',
      ucId: insc.ucId || '',
      ucCode: insc.ucCode || '',
      ucName: insc.ucName || '',
      academicYear: insc.academicYear || this.db.settings?.currentAcademicYear || '',
      year: insc.year || 1,
      semester: insc.semester || 1,
      creditsECTS: insc.creditsECTS || 6,
      isCadeiraAtraso: !!insc.isCadeiraAtraso,
      status: insc.status || 'inscrito',
      notaFrequencia: insc.notaFrequencia,
      notaExameNormal: insc.notaExameNormal,
      notaRecurso: insc.notaRecurso,
      notaEspecial: insc.notaEspecial,
      notaFinal: insc.notaFinal,
      epocaAprovacao: insc.epocaAprovacao,
      inscribedAt: insc.inscribedAt || new Date().toISOString(),
      observations: insc.observations
    };
    const exists = list.some((item) => item.id === id);
    this.db.inscricoesUC = exists
      ? list.map((item) => (item.id === id ? fullInsc : item))
      : [...list, fullInsc];
    this.notify();
    return fullInsc;
  }

  public deleteInscricaoUC(id: string): boolean {
    const list = this.db.inscricoesUC || [];
    this.db.inscricoesUC = list.filter((i) => i.id !== id);
    this.notify();
    return true;
  }

  public saveMonografiaTCC(tcc: Partial<MonografiaTCC>): MonografiaTCC {
    const list = this.db.monografiasTCC || [];
    const now = new Date().toISOString();
    const id = tcc.id || `tcc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullTCC: MonografiaTCC = {
      id,
      code: tcc.code || `TCC-${new Date().getFullYear()}-${list.length + 1}`,
      studentId: tcc.studentId || '',
      studentName: tcc.studentName || '',
      studentProcNumber: tcc.studentProcNumber || '',
      courseId: tcc.courseId || '',
      courseName: tcc.courseName || '',
      academicYear: tcc.academicYear || this.db.settings?.currentAcademicYear || '',
      theme: tcc.theme || 'Tema da Monografia',
      abstract: tcc.abstract,
      advisorName: tcc.advisorName || 'Docente Orientador',
      advisorEmail: tcc.advisorEmail,
      coAdvisorName: tcc.coAdvisorName,
      lineOfResearch: tcc.lineOfResearch,
      status: tcc.status || 'proposta',
      submissionDate: tcc.submissionDate,
      defenseDate: tcc.defenseDate,
      defenseTime: tcc.defenseTime,
      defenseRoom: tcc.defenseRoom,
      juryPresident: tcc.juryPresident,
      juryArguente: tcc.juryArguente,
      juryVogal: tcc.juryVogal,
      defenseGrade: tcc.defenseGrade,
      finalMention: tcc.finalMention,
      depositUrl: tcc.depositUrl,
      createdAt: tcc.createdAt || now,
      updatedAt: now
    };
    const exists = list.some((item) => item.id === id);
    this.db.monografiasTCC = exists
      ? list.map((item) => (item.id === id ? fullTCC : item))
      : [...list, fullTCC];
    this.notify();
    return fullTCC;
  }

  public deleteMonografiaTCC(id: string): boolean {
    const list = this.db.monografiasTCC || [];
    this.db.monografiasTCC = list.filter((m) => m.id !== id);
    this.notify();
    return true;
  }

  public saveEstagioCurricular(estagio: Partial<EstagioCurricular>): EstagioCurricular {
    const list = this.db.estagiosCurriculares || [];
    const id = estagio.id || `est-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullEstagio: EstagioCurricular = {
      id,
      code: estagio.code || `EST-${new Date().getFullYear()}-${list.length + 1}`,
      studentId: estagio.studentId || '',
      studentName: estagio.studentName || '',
      studentProcNumber: estagio.studentProcNumber || '',
      courseId: estagio.courseId || '',
      courseName: estagio.courseName || '',
      academicYear: estagio.academicYear || this.db.settings?.currentAcademicYear || '',
      institutionOrCompany: estagio.institutionOrCompany || '',
      sector: estagio.sector,
      supervisorName: estagio.supervisorName || '',
      supervisorContact: estagio.supervisorContact,
      tutorTeacherName: estagio.tutorTeacherName || '',
      totalRequiredHours: estagio.totalRequiredHours || 300,
      completedHours: estagio.completedHours || 0,
      startDate: estagio.startDate || new Date().toISOString().split('T')[0],
      endDate: estagio.endDate || '',
      status: estagio.status || 'em_curso',
      reportGrade: estagio.reportGrade,
      supervisorGrade: estagio.supervisorGrade,
      finalGrade: estagio.finalGrade,
      notes: estagio.notes
    };
    const exists = list.some((item) => item.id === id);
    this.db.estagiosCurriculares = exists
      ? list.map((item) => (item.id === id ? fullEstagio : item))
      : [...list, fullEstagio];
    this.notify();
    return fullEstagio;
  }

  public deleteEstagioCurricular(id: string): boolean {
    const list = this.db.estagiosCurriculares || [];
    this.db.estagiosCurriculares = list.filter((e) => e.id !== id);
    this.notify();
    return true;
  }

  public saveBolsaEstudo(bolsa: Partial<BolsaEstudo>): BolsaEstudo {
    const list = this.db.bolsasEstudo || [];
    const id = bolsa.id || `bol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullBolsa: BolsaEstudo = {
      id,
      code: bolsa.code || `BOL-${new Date().getFullYear()}-${list.length + 1}`,
      studentId: bolsa.studentId || '',
      studentName: bolsa.studentName || '',
      studentProcNumber: bolsa.studentProcNumber || '',
      courseId: bolsa.courseId || '',
      courseName: bolsa.courseName || '',
      academicYear: bolsa.academicYear || this.db.settings?.currentAcademicYear || '',
      type: bolsa.type || 'INAGBE',
      sponsorName: bolsa.sponsorName || 'INAGBE - Governo de Angola',
      coverageType: bolsa.coverageType || 'integral_100',
      fixedMonthlyAmountKz: bolsa.fixedMonthlyAmountKz,
      discountPercent: bolsa.discountPercent ?? 100,
      status: bolsa.status || 'ativa',
      startDate: bolsa.startDate || new Date().toISOString().split('T')[0],
      endDate: bolsa.endDate,
      minAverageRequired: bolsa.minAverageRequired || 12.0,
      maxArrearsAllowed: bolsa.maxArrearsAllowed || 1,
      suspensionReason: bolsa.suspensionReason,
      notes: bolsa.notes
    };
    const exists = list.some((item) => item.id === id);
    this.db.bolsasEstudo = exists
      ? list.map((item) => (item.id === id ? fullBolsa : item))
      : [...list, fullBolsa];
    this.notify();
    return fullBolsa;
  }

  public deleteBolsaEstudo(id: string): boolean {
    const list = this.db.bolsasEstudo || [];
    this.db.bolsasEstudo = list.filter((b) => b.id !== id);
    this.notify();
    return true;
  }

  public saveDiplomaSuperior(diploma: Partial<DiplomaSuperior>): DiplomaSuperior {
    const list = this.db.diplomasSuperior || [];
    const id = diploma.id || `dip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullDiploma: DiplomaSuperior = {
      id,
      code: diploma.code || `DIP-${new Date().getFullYear()}-${list.length + 1}`,
      studentId: diploma.studentId || '',
      studentName: diploma.studentName || '',
      studentProcNumber: diploma.studentProcNumber || '',
      courseId: diploma.courseId || '',
      courseName: diploma.courseName || '',
      degreeGranted: diploma.degreeGranted || 'Licenciatura',
      degreeTitle: diploma.degreeTitle || 'Licenciado',
      academicYearConcluded: diploma.academicYearConcluded || this.db.settings?.currentAcademicYear || '',
      completionDate: diploma.completionDate || new Date().toISOString().split('T')[0],
      finalGradeCurricular: diploma.finalGradeCurricular || 14,
      tccGrade: diploma.tccGrade,
      finalCourseGrade: diploma.finalCourseGrade || 14,
      finalMention: diploma.finalMention || 'Bom',
      totalCreditsECTS: diploma.totalCreditsECTS || 240,
      registerNumber: diploma.registerNumber || `${list.length + 1}/${new Date().getFullYear()}`,
      registryBook: diploma.registryBook || 'Livro I',
      registryPage: diploma.registryPage || `${list.length + 1}`,
      issueDate: diploma.issueDate || new Date().toISOString().split('T')[0],
      dispatchNumber: diploma.dispatchNumber,
      rectorName: diploma.rectorName || 'Magnífico Reitor',
      academicDirectorName: diploma.academicDirectorName || 'Diretor dos Assuntos Académicos',
      status: diploma.status || 'emitido'
    };
    const exists = list.some((item) => item.id === id);
    this.db.diplomasSuperior = exists
      ? list.map((item) => (item.id === id ? fullDiploma : item))
      : [...list, fullDiploma];
    this.notify();
    return fullDiploma;
  }

  public deleteDiplomaSuperior(id: string): boolean {
    const list = this.db.diplomasSuperior || [];
    this.db.diplomasSuperior = list.filter((d) => d.id !== id);
    this.notify();
    return true;
  }

  // ------------------------------------------------------------------
  // Portal do Professor — Plano de Aulas, Sumários, Materiais de Apoio
  // ------------------------------------------------------------------
  private newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  private currentAcademicYearValue(): string {
    return this.db.settings?.currentAcademicYear || getFallbackAcademicYear();
  }

  private teacherNameById(teacherId?: string): string {
    const t = (this.db.teachers || []).find((x) => String(x.id) === String(teacherId));
    return t?.name || this.db.currentUser?.name || 'Professor';
  }

  public saveLessonPlan(input: {
    id?: string; teacherId: string; classId: string; subjectName: string; trimester: '1' | '2' | '3';
    weekStart: string; topic: string; objectives: string; activities: string; resources?: string; evaluation?: string;
    attachment?: LessonPlan['attachment'];
  }): { success: boolean; error?: string } {
    const errors = validateLessonPlan(input);
    if (errors.length) return { success: false, error: errors[0] };
    const cls = (this.db.classes || []).find((c) => String(c.id) === String(input.classId));
    if (!cls) return { success: false, error: 'Turma não encontrada.' };
    const list = this.db.lessonPlans || [];
    const now = new Date().toISOString();
    const existing = input.id ? list.find((p) => p.id === input.id) : undefined;
    if (input.id && !existing) return { success: false, error: 'Plano não encontrado.' };
    if (existing && (existing.status === 'submetido' || existing.status === 'aprovado')) {
      return { success: false, error: 'Um plano submetido ou aprovado já não pode ser editado.' };
    }
    const plan: LessonPlan = {
      id: existing?.id || this.newId('plano'),
      academicYear: existing?.academicYear || cls.academicYear || this.currentAcademicYearValue(),
      teacherId: String(input.teacherId),
      teacherName: this.teacherNameById(input.teacherId),
      classId: String(cls.id),
      className: cls.name,
      subjectName: input.subjectName.trim(),
      trimester: input.trimester,
      weekStart: input.weekStart,
      topic: input.topic.trim(),
      objectives: input.objectives.trim(),
      activities: input.activities.trim(),
      resources: input.resources?.trim() || undefined,
      evaluation: input.evaluation?.trim() || undefined,
      attachment: input.attachment,
      status: existing ? (existing.status === 'devolvido' ? 'rascunho' : existing.status) : 'rascunho',
      reviewerNote: existing?.reviewerNote,
      reviewedBy: existing?.reviewedBy,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.db.lessonPlans = existing ? list.map((p) => (p.id === plan.id ? plan : p)) : [plan, ...list];
    this.notify();
    return { success: true };
  }

  public transitionLessonPlan(id: string, action: 'submeter' | 'aprovar' | 'devolver', note?: string, isManager = false): { success: boolean; error?: string } {
    const plan = (this.db.lessonPlans || []).find((p) => p.id === id);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    const res = planTransition(plan, action, { name: this.currentActorName(), isManager }, note);
    if (res.ok === false) return { success: false, error: res.error };
    const updated: LessonPlan = { ...res.plan, updatedAt: new Date().toISOString() };
    this.db.lessonPlans = (this.db.lessonPlans || []).map((p) => (p.id === id ? updated : p));
    this.addAuditLog({
      userName: this.currentActorName(), userRole: 'Utilizador',
      action: action === 'submeter' ? 'Plano de aulas submetido' : action === 'aprovar' ? 'Plano de aulas aprovado' : 'Plano de aulas devolvido',
      details: `${plan.className} · ${plan.subjectName} · ${plan.topic}`,
      module: 'pedagogico', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
    } as any);
    this.notify();
    return { success: true };
  }

  public deleteLessonPlan(id: string): { success: boolean; error?: string } {
    const plan = (this.db.lessonPlans || []).find((p) => p.id === id);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    if (plan.status === 'submetido' || plan.status === 'aprovado') return { success: false, error: 'Só se apagam planos em rascunho ou devolvidos.' };
    this.db.lessonPlans = (this.db.lessonPlans || []).filter((p) => p.id !== id);
    this.notify();
    return { success: true };
  }

  public saveLessonSummary(input: { id?: string; classId: string; subjectName: string; date: string; topic: string; summary: string; homework?: string }): { success: boolean; error?: string } {
    const errors = validateSummary(input);
    if (errors.length) return { success: false, error: errors[0] };
    const cls = (this.db.classes || []).find((c) => String(c.id) === String(input.classId));
    if (!cls) return { success: false, error: 'Turma não encontrada.' };
    const list = this.db.lessonSummaries || [];
    const existing = input.id ? list.find((e) => e.id === input.id) : undefined;
    const year = existing?.academicYear || cls.academicYear || this.currentAcademicYearValue();
    const now = new Date().toISOString();
    const teacherId = existing?.teacherId || String(this.db.currentUser?.id || '');
    const entry: LessonSummaryEntry = {
      id: existing?.id || this.newId('sumario'),
      academicYear: year,
      teacherId,
      teacherName: existing?.teacherName || this.teacherNameById(teacherId),
      classId: String(cls.id),
      className: cls.name,
      subjectName: input.subjectName.trim(),
      date: input.date,
      lessonNumber: existing?.lessonNumber || nextLessonNumber(list, String(cls.id), input.subjectName.trim(), year),
      topic: input.topic.trim(),
      summary: input.summary.trim(),
      homework: input.homework?.trim() || undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: existing ? now : undefined
    };
    this.db.lessonSummaries = existing ? list.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...list];
    // O sumário passa a constar da caderneta de assiduidade da mesma turma, disciplina e dia.
    const text = formatSummaryForAttendance(findSummariesForLesson(this.db.lessonSummaries, entry.classId, entry.subjectName, entry.date));
    const norm = (v?: string) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const syncSheet = <T extends { classId?: any; date?: string; subjectName?: string }>(sh: T): T =>
      String(sh.classId) === entry.classId && sh.date === entry.date && norm(sh.subjectName) === norm(entry.subjectName) ? ({ ...sh, lessonSummary: text } as T) : sh;
    if (this.db.attendanceSheets) this.db.attendanceSheets = this.db.attendanceSheets.map(syncSheet);
    this.notify();
    return { success: true };
  }

  public saveTeachingMaterial(input: { classId: string; subjectName: string; title: string; description?: string; link: string; visibleToStudents: boolean }): { success: boolean; error?: string } {
    const errors = validateMaterial(input);
    if (errors.length) return { success: false, error: errors[0] };
    const cls = (this.db.classes || []).find((c) => String(c.id) === String(input.classId));
    if (!cls) return { success: false, error: 'Turma não encontrada.' };
    const teacherId = String(this.db.currentUser?.id || '');
    const material: TeachingMaterial = {
      id: this.newId('material'),
      academicYear: cls.academicYear || this.currentAcademicYearValue(),
      teacherId,
      teacherName: this.teacherNameById(teacherId),
      classId: String(cls.id),
      className: cls.name,
      subjectName: input.subjectName.trim(),
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      link: input.link.trim(),
      visibleToStudents: !!input.visibleToStudents,
      createdAt: new Date().toISOString()
    };
    this.db.teachingMaterials = [material, ...(this.db.teachingMaterials || [])];
    this.notify();
    return { success: true };
  }

  public deleteTeachingMaterial(id: string): { success: boolean } {
    this.db.teachingMaterials = (this.db.teachingMaterials || []).filter((m) => m.id !== id);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Trabalhos Online (EaD)
  // ------------------------------------------------------------------
  public saveAssignment(input: {
    id?: string; classId: string; subjectName: string; teacherId?: string; title: string; instructions: string;
    dueAt: string; maxGrade: number; allowLate: boolean; externalLink?: string; status: Assignment['status'];
  }): { success: boolean; error?: string } {
    const errors = validateAssignment(input);
    if (errors.length) return { success: false, error: errors[0] };
    const cls = (this.db.classes || []).find((c) => String(c.id) === String(input.classId));
    if (!cls) return { success: false, error: 'Turma não encontrada.' };
    const list = this.db.assignments || [];
    const existing = input.id ? list.find((a) => a.id === input.id) : undefined;
    const subject = (this.db.subjects || []).find((s) => s.name === input.subjectName.trim());
    const assignment: Assignment = {
      id: existing?.id || this.newId('trabalho'),
      academicYear: existing?.academicYear || cls.academicYear || this.currentAcademicYearValue(),
      classId: String(cls.id),
      className: cls.name,
      subjectId: subject ? String(subject.id) : existing?.subjectId,
      subjectName: input.subjectName.trim(),
      teacherId: input.teacherId,
      teacherName: this.teacherNameById(input.teacherId),
      title: input.title.trim(),
      instructions: (input.instructions || '').trim(),
      dueAt: input.dueAt,
      maxGrade: input.maxGrade,
      allowLate: !!input.allowLate,
      externalLink: input.externalLink?.trim() || undefined,
      status: input.status,
      createdAt: existing?.createdAt || new Date().toISOString(),
      createdBy: existing?.createdBy || this.currentActorName()
    };
    this.db.assignments = existing ? list.map((a) => (a.id === assignment.id ? assignment : a)) : [assignment, ...list];
    this.notify();
    return { success: true };
  }

  public setAssignmentStatus(id: string, status: Assignment['status']): { success: boolean; error?: string } {
    const a = (this.db.assignments || []).find((x) => x.id === id);
    if (!a) return { success: false, error: 'Trabalho não encontrado.' };
    this.db.assignments = (this.db.assignments || []).map((x) => (x.id === id ? { ...x, status } : x));
    this.notify();
    return { success: true };
  }

  public submitAssignment(assignmentId: string, studentId: string, input: { text?: string; link?: string }): { success: boolean; error?: string } {
    const a = (this.db.assignments || []).find((x) => x.id === assignmentId);
    if (!a) return { success: false, error: 'Trabalho não encontrado.' };
    const student = (this.db.students || []).find((s) => String(s.id) === String(studentId));
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    if (String(student.classId) !== String(a.classId)) return { success: false, error: 'Este trabalho não é da sua turma.' };
    const subs = this.db.assignmentSubmissions || [];
    const existing = subs.find((s) => s.assignmentId === assignmentId && String(s.studentId) === String(studentId));
    const res = submitWork(a, existing, { studentId: String(studentId), studentName: student.name, text: input.text, link: input.link }, Date.now(), this.newId('entrega'));
    if (res.ok === false) return { success: false, error: res.error };
    const submission = { ...res.submission, submitterUid: this.db.currentUser?.id ? String(this.db.currentUser.id) : undefined };
    this.db.assignmentSubmissions = existing ? subs.map((s) => (s.id === submission.id ? submission : s)) : [submission, ...subs];
    this.notify();
    return { success: true };
  }

  public gradeAssignmentSubmission(submissionId: string, grade: number, feedback: string): { success: boolean; error?: string } {
    const sub = (this.db.assignmentSubmissions || []).find((s) => s.id === submissionId);
    if (!sub) return { success: false, error: 'Entrega não encontrada.' };
    const a = (this.db.assignments || []).find((x) => x.id === sub.assignmentId);
    if (!a) return { success: false, error: 'Trabalho não encontrado.' };
    const res = gradeSubmission(a, sub, grade, feedback || '', this.currentActorName(), Date.now());
    if (res.ok === false) return { success: false, error: res.error };
    this.db.assignmentSubmissions = (this.db.assignmentSubmissions || []).map((s) => (s.id === submissionId ? res.submission : s));
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Avaliação Descritiva (Pré-escolar / Primário)
  // ------------------------------------------------------------------
  public saveDescriptiveAssessment(input: {
    studentId: string; trimester: '1' | '2' | '3'; levels: DescriptiveAssessment['levels'];
    strengths?: string; needs?: string; recommendations?: string; publish: boolean;
  }): { success: boolean; error?: string } {
    const student = (this.db.students || []).find((s) => String(s.id) === String(input.studentId));
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    const areas = defaultAreasForGrade(student.grade || '');
    if (input.publish) {
      const blockers = publishBlockers(areas, { levels: input.levels, strengths: input.strengths });
      if (blockers.length) return { success: false, error: blockers[0] };
    }
    const year = this.currentAcademicYearValue();
    const list = this.db.descriptiveAssessments || [];
    const existing = list.find((d) => String(d.studentId) === String(student.id) && d.trimester === input.trimester && d.academicYear === year);
    const record: DescriptiveAssessment = {
      id: existing?.id || this.newId('descritiva'),
      academicYear: year,
      trimester: input.trimester,
      studentId: String(student.id),
      studentName: student.name,
      classId: student.classId,
      className: student.className,
      levels: input.levels,
      strengths: input.strengths?.trim() || undefined,
      needs: input.needs?.trim() || undefined,
      recommendations: input.recommendations?.trim() || undefined,
      guardianAck: existing?.guardianAck,
      status: input.publish ? 'publicado' : (existing?.status === 'publicado' ? 'publicado' : 'rascunho'),
      teacherName: this.currentActorName(),
      updatedAt: new Date().toISOString()
    };
    this.db.descriptiveAssessments = existing ? list.map((d) => (d.id === record.id ? record : d)) : [record, ...list];
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Biblioteca — política, acervo, empréstimos, renovações e multas
  // ------------------------------------------------------------------
  public getLibraryPolicy(): LibraryPolicy {
    return { ...DEFAULT_LIBRARY_POLICY, ...(this.db.settings?.libraryPolicy || {}) };
  }

  public saveLibraryPolicy(input: Partial<LibraryPolicy>): { success: boolean; error?: string } {
    const next: LibraryPolicy = { ...this.getLibraryPolicy(), ...input };
    const ints: Array<keyof LibraryPolicy> = ['loanDays', 'graceDays', 'finePerDay', 'fineCap', 'maxActiveLoans', 'maxRenewals'];
    for (const k of ints) {
      const v = Number(next[k]);
      if (!Number.isFinite(v) || v < 0) return { success: false, error: 'Os valores da política têm de ser números iguais ou superiores a zero.' };
      (next as any)[k] = Math.round(v);
    }
    if (next.loanDays < 1) return { success: false, error: 'O prazo de empréstimo tem de ser de pelo menos 1 dia.' };
    if (next.maxActiveLoans < 1) return { success: false, error: 'O máximo de empréstimos ativos tem de ser pelo menos 1.' };
    next.blockOnUnpaidFines = !!next.blockOnUnpaidFines;
    this.db.settings = { ...this.db.settings, libraryPolicy: next };
    this.notify();
    return { success: true };
  }

  public saveBook(input: { id?: string; title: string; author?: string; isbn?: string; category?: string; shelfLocation?: string; totalCopies: number }): { success: boolean; error?: string } {
    if (!input.title?.trim()) return { success: false, error: 'Indique o título do livro.' };
    const total = Math.round(Number(input.totalCopies));
    if (!Number.isFinite(total) || total < 1) return { success: false, error: 'Indique o número de exemplares (mínimo 1).' };
    const books = this.db.books || [];
    const existing = input.id ? books.find((b) => b.id === input.id) : undefined;
    if (existing) {
      const out = existing.totalCopies - existing.availableCopies;
      if (total < out) return { success: false, error: `Há ${out} exemplar(es) emprestado(s); o total não pode ser inferior.` };
      const updated: LibraryBook = {
        ...existing, title: input.title.trim(), author: input.author?.trim() || '', isbn: input.isbn?.trim() || '',
        category: input.category?.trim() || '', shelfLocation: input.shelfLocation?.trim() || '',
        totalCopies: total, availableCopies: total - out
      };
      this.db.books = books.map((b) => (b.id === updated.id ? updated : b));
    } else {
      const book: LibraryBook = {
        id: this.newId('livro'), title: input.title.trim(), author: input.author?.trim() || '', isbn: input.isbn?.trim() || '',
        category: input.category?.trim() || '', shelfLocation: input.shelfLocation?.trim() || '', totalCopies: total, availableCopies: total
      };
      this.db.books = [book, ...books];
    }
    this.notify();
    return { success: true };
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public renewBookLoan(loanId: string): { success: boolean; error?: string } {
    const loan = (this.db.loans || []).find((l) => l.id === loanId);
    if (!loan) return { success: false, error: 'Empréstimo não encontrado.' };
    const policy = this.getLibraryPolicy();
    const asOf = this.todayISO();
    const blockers = renewBlockers(loan as any, asOf, policy);
    if (blockers.length) return { success: false, error: blockers[0] };
    const renewed = renewLoan(loan as any, asOf, policy);
    this.db.loans = this.db.loans.map((l) => (l.id === loanId ? { ...l, ...renewed } as BookLoan : l));
    this.notify();
    return { success: true };
  }

  public markBookLost(loanId: string, replacementCost: number): { success: boolean; error?: string } {
    const loan = (this.db.loans || []).find((l) => l.id === loanId);
    if (!loan) return { success: false, error: 'Empréstimo não encontrado.' };
    if (loan.returnDate || loan.status === 'devolvido' || loan.status === 'perdido') return { success: false, error: 'O empréstimo já está encerrado.' };
    const cost = Number(replacementCost);
    if (!Number.isFinite(cost) || cost < 0) return { success: false, error: 'Indique o valor de reposição do livro.' };
    const lost = markLost(loan as any, this.todayISO(), cost);
    this.db.loans = this.db.loans.map((l) => (l.id === loanId ? { ...l, ...lost } as BookLoan : l));
    // O exemplar perdido sai do acervo: o total diminui, os disponíveis não aumentam.
    this.db.books = (this.db.books || []).map((b) => (b.id === loan.bookId ? { ...b, totalCopies: Math.max(0, b.totalCopies - 1) } : b));
    this.notify();
    return { success: true };
  }

  public payLoanFine(loanId: string): { success: boolean; error?: string } {
    const loan = (this.db.loans || []).find((l) => l.id === loanId);
    if (!loan) return { success: false, error: 'Empréstimo não encontrado.' };
    if (!(loan.fineAmount && loan.fineAmount > 0)) return { success: false, error: 'Este empréstimo não tem multa.' };
    if (loan.finePaid) return { success: false, error: 'A multa já foi paga.' };
    const paid = payFine(loan as any, this.todayISO());
    this.db.loans = this.db.loans.map((l) => (l.id === loanId ? { ...l, ...paid } as BookLoan : l));
    this.notify();
    return { success: true };
  }

  public waiveLoanFine(loanId: string, reason: string): { success: boolean; error?: string } {
    const loan = (this.db.loans || []).find((l) => l.id === loanId);
    if (!loan) return { success: false, error: 'Empréstimo não encontrado.' };
    if (!(reason || '').trim()) return { success: false, error: 'Indique o motivo para perdoar a multa.' };
    if (!(loan.fineAmount && loan.fineAmount > 0) || loan.finePaid) return { success: false, error: 'Não há multa por perdoar neste empréstimo.' };
    const waived = waiveFine(loan as any, reason);
    this.db.loans = this.db.loans.map((l) => (l.id === loanId ? { ...l, ...waived } as BookLoan : l));
    this.addAuditLog({
      userName: this.currentActorName(), userRole: 'Utilizador', action: 'Multa de biblioteca perdoada',
      details: `${loan.bookTitle} · ${loan.borrowerName} · ${reason.trim()}`, module: 'biblioteca', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
    } as any);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Financeiro avançado — planos de pagamento, regras de desconto,
  // conciliação bancária, despesas e caixa
  // ------------------------------------------------------------------
  public createPaymentPlan(input: { studentId: string; description: string; total: number; count: number; firstDueISO: string }): { success: boolean; error?: string } {
    const student = (this.db.students || []).find((s) => String(s.id) === String(input.studentId));
    if (!student) return { success: false, error: 'Escolha o aluno.' };
    if (!(input.description || '').trim()) return { success: false, error: 'Indique a descrição do plano.' };
    if (!(input.total > 0)) return { success: false, error: 'O valor total tem de ser maior que zero.' };
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 60) return { success: false, error: 'O número de prestações tem de estar entre 1 e 60.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueISO || '')) return { success: false, error: 'Indique a data da primeira prestação.' };
    const installments = buildInstallmentPlan(Math.round(input.total), input.count, input.firstDueISO);
    if (!installments.length) return { success: false, error: 'Não foi possível calcular as prestações.' };
    const plan: PaymentPlan = {
      id: this.newId('plano-pag'), studentId: String(student.id), studentName: student.name,
      academicYear: this.currentAcademicYearValue(), description: input.description.trim(),
      total: Math.round(input.total), installments, status: 'ativo',
      createdBy: this.currentActorName(), createdAt: new Date().toISOString()
    };
    this.db.paymentPlans = [plan, ...(this.db.paymentPlans || [])];
    this.notify();
    return { success: true };
  }

  public setInstallmentPaid(planId: string, number: number, paid: boolean): { success: boolean; error?: string } {
    const plan = (this.db.paymentPlans || []).find((p) => p.id === planId);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    if (plan.status === 'cancelado') return { success: false, error: 'O plano está cancelado.' };
    const installments = plan.installments.map((i) => (i.number === number ? { ...i, paid } : i));
    const status: PaymentPlan['status'] = installments.every((i) => i.paid) ? 'concluido' : 'ativo';
    this.db.paymentPlans = (this.db.paymentPlans || []).map((p) => (p.id === planId ? { ...p, installments, status } : p));
    this.notify();
    return { success: true };
  }

  public cancelPaymentPlan(planId: string): { success: boolean; error?: string } {
    const plan = (this.db.paymentPlans || []).find((p) => p.id === planId);
    if (!plan) return { success: false, error: 'Plano não encontrado.' };
    this.db.paymentPlans = (this.db.paymentPlans || []).map((p) => (p.id === planId ? { ...p, status: 'cancelado' as const } : p));
    this.notify();
    return { success: true };
  }

  public saveDiscountRule(input: Partial<StoredDiscountRule> & { label: string; kind: 'percent' | 'fixed'; value: number }): { success: boolean; error?: string } {
    if (!(input.label || '').trim()) return { success: false, error: 'Indique o nome da regra.' };
    if (!Number.isFinite(input.value) || input.value <= 0) return { success: false, error: 'O valor do desconto tem de ser maior que zero.' };
    if (input.kind === 'percent' && input.value > 100) return { success: false, error: 'Uma percentagem não pode passar de 100.' };
    const list = this.db.discountRules || [];
    const existing = input.id ? list.find((r) => r.id === input.id) : undefined;
    const rule: StoredDiscountRule = {
      id: existing?.id || this.newId('regra'),
      label: input.label.trim(), kind: input.kind, value: input.value,
      minSiblingPosition: input.minSiblingPosition || undefined,
      paidByDay: input.paidByDay || undefined,
      stackable: !!input.stackable,
      active: input.active !== false
    };
    this.db.discountRules = existing ? list.map((r) => (r.id === rule.id ? rule : r)) : [...list, rule];
    this.notify();
    return { success: true };
  }

  public deleteDiscountRule(id: string): { success: boolean } {
    this.db.discountRules = (this.db.discountRules || []).filter((r) => r.id !== id);
    this.notify();
    return { success: true };
  }

  public importBankStatementLines(lines: Array<{ date: string; amount: number; description: string; reference?: string }>): { imported: number; duplicates: number } {
    const existing = this.db.bankStatementLines || [];
    const keyOf = (l: { date: string; amount: number; description: string; reference?: string }) =>
      `${l.date}|${Math.round(l.amount * 100)}|${(l.reference || '').trim().toUpperCase()}|${(l.description || '').trim().toLowerCase()}`;
    const seen = new Set(existing.map(keyOf));
    const batchId = this.newId('extrato');
    const now = new Date().toISOString();
    const actor = this.currentActorName();
    const fresh: BankStatementLine[] = [];
    let duplicates = 0;
    for (const l of lines) {
      const k = keyOf(l);
      if (seen.has(k)) { duplicates += 1; continue; }
      seen.add(k);
      fresh.push({
        id: this.newId('bl'), date: l.date, amount: l.amount, description: l.description,
        reference: l.reference || undefined, status: 'por_conciliar', importedAt: now, importedBy: actor, batchId
      });
    }
    if (fresh.length) {
      this.db.bankStatementLines = [...fresh, ...existing];
      this.notify();
    }
    return { imported: fresh.length, duplicates };
  }

  public confirmBankMatch(lineId: string, invoiceId: string): { success: boolean; error?: string } {
    const line = (this.db.bankStatementLines || []).find((l) => l.id === lineId);
    if (!line) return { success: false, error: 'Linha do extrato não encontrada.' };
    if (line.status !== 'por_conciliar') return { success: false, error: 'Esta linha já foi tratada.' };
    const inv = (this.db.invoices || []).find((i) => String(i.id) === String(invoiceId));
    if (!inv) return { success: false, error: 'Fatura não encontrada.' };
    if (inv.status === 'pago') return { success: false, error: 'Esta fatura já está paga.' };
    if (line.amount <= 0) return { success: false, error: 'Só se concilia um crédito (entrada) com uma fatura.' };
    const [y, m, d] = (line.date || '').split('-');
    const payDate = y && m && d ? `${d}/${m}/${y}` : new Date().toLocaleDateString('pt-PT');
    inv.status = 'pago';
    inv.method = 'multicaixa';
    inv.methodLabel = 'Transferência bancária (conciliada)';
    inv.paymentDate = payDate;
    inv.totalPaidKz = line.amount;
    inv.receiptNumber = inv.receiptNumber || `RC ${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
    inv.receiptGeneratedAt = payDate;
    const student = (this.db.students || []).find((s) => String(s.id) === String(inv.studentId));
    if (student) {
      student.isTuitionPaidCurrentMonth = true;
      const otherDebts = (this.db.invoices || []).some((o) => String(o.studentId) === String(student.id) && o.id !== inv.id && o.status === 'atraso');
      if (!otherDebts) student.financialStatus = 'regular';
    }
    this.db.bankStatementLines = (this.db.bankStatementLines || []).map((l) => (l.id === lineId ? { ...l, status: 'conciliada' as const, matchedInvoiceId: String(inv.id) } : l));
    this.addAuditLog({
      userName: this.currentActorName(), userRole: 'Utilizador', action: 'Conciliação bancária confirmada',
      details: `${inv.invoiceNumber} · ${inv.studentName} · ${line.amount} Kz`, module: 'financeiro', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
    } as any);
    this.notify();
    return { success: true };
  }

  public ignoreBankLine(lineId: string): { success: boolean } {
    this.db.bankStatementLines = (this.db.bankStatementLines || []).map((l) => (l.id === lineId && l.status === 'por_conciliar' ? { ...l, status: 'ignorada' as const } : l));
    this.notify();
    return { success: true };
  }

  private openCashSessionOrNull(): CashSession | undefined {
    return (this.db.cashSessions || []).find((c) => c.status === 'aberto');
  }

  public openCashSession(input: { openingFloat: number; note?: string }): { success: boolean; error?: string } {
    if (this.openCashSessionOrNull()) return { success: false, error: 'Já existe uma caixa aberta.' };
    const float = Number(input.openingFloat);
    if (!Number.isFinite(float) || float < 0) return { success: false, error: 'Indique o fundo de maneio (zero ou mais).' };
    const session: CashSession = {
      id: this.newId('caixa'), status: 'aberto', openedAt: new Date().toISOString(), openedBy: this.currentActorName(),
      openingFloat: Math.round(float), openingNote: input.note?.trim() || undefined
    };
    this.db.cashSessions = [session, ...(this.db.cashSessions || [])];
    this.notify();
    return { success: true };
  }

  public closeCashSession(input: { sessionId: string; countedCash: number; note?: string }): { success: boolean; error?: string } {
    const session = (this.db.cashSessions || []).find((c) => c.id === input.sessionId);
    if (!session) return { success: false, error: 'Sessão de caixa não encontrada.' };
    if (session.status !== 'aberto') return { success: false, error: 'A caixa já está fechada.' };
    const counted = Number(input.countedCash);
    if (!Number.isFinite(counted) || counted < 0) return { success: false, error: 'Indique o numerário contado (zero ou mais).' };
    const ledger = buildLedger((this.db.invoices || []) as any, (this.db.expenses || []) as any, (this.db.payrollRecords || []) as any, (this.db.assets || []) as any);
    const done = new Set<string>();
    (this.db.cashSessions || []).forEach((c) => (c.movementIds || []).forEach((id) => done.add(id)));
    const t = computeSessionTotals(ledger, session.openedAt, session.openingFloat, done);
    const closed: CashSession = {
      ...session, status: 'fechado', closedAt: new Date().toISOString(), closedBy: this.currentActorName(),
      cashIn: t.cashIn, otherIn: t.otherIn, totalIn: t.totalIn, inByMethod: t.byMethod,
      expectedDrawerCash: t.expectedDrawerCash, cashOut: t.cashOut, expectedCash: t.expectedCash,
      countedCash: Math.round(counted), difference: Math.round(counted) - t.expectedDrawerCash,
      closingNote: input.note?.trim() || undefined, movementIds: t.movementIds
    };
    this.db.cashSessions = (this.db.cashSessions || []).map((c) => (c.id === session.id ? closed : c));
    this.addAuditLog({
      userName: this.currentActorName(), userRole: 'Utilizador', action: 'Caixa fechada',
      details: `Diferença de ${closed.difference} Kz (esperado ${t.expectedDrawerCash} Kz, contado ${closed.countedCash} Kz).`,
      module: 'financeiro', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
    } as any);
    this.notify();
    return { success: true };
  }

  public saveExpense(input: { supplier?: string; category: string; description?: string; amount: number; date: string; dueDate?: string; paidDate?: string }): { success: boolean; error?: string } {
    if (!(input.category || '').trim()) return { success: false, error: 'Indique a categoria da despesa.' };
    if (!Number.isFinite(input.amount) || input.amount <= 0) return { success: false, error: 'O valor da despesa tem de ser maior que zero.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) return { success: false, error: 'Indique a data da despesa.' };
    if (input.paidDate && isCashRegisterRequired() && !this.openCashSessionOrNull()) return { success: false, error: CASH_CLOSED_MESSAGE };
    const expense: ExpenseRecord = {
      id: this.newId('desp'), supplier: input.supplier?.trim() || undefined, category: input.category.trim(),
      description: input.description?.trim() || undefined, amount: Math.round(input.amount), date: input.date,
      dueDate: input.dueDate || undefined, paidDate: input.paidDate || undefined,
      createdBy: this.currentActorName(), createdAt: new Date().toISOString()
    };
    this.db.expenses = [expense, ...(this.db.expenses || [])];
    this.notify();
    return { success: true };
  }

  public markExpensePaid(id: string, paidDate: string): { success: boolean; error?: string } {
    const e = (this.db.expenses || []).find((x) => x.id === id);
    if (!e) return { success: false, error: 'Despesa não encontrada.' };
    if (e.paidDate) return { success: false, error: 'A despesa já está paga.' };
    if (isCashRegisterRequired() && !this.openCashSessionOrNull()) return { success: false, error: CASH_CLOSED_MESSAGE };
    this.db.expenses = (this.db.expenses || []).map((x) => (x.id === id ? { ...x, paidDate } : x));
    this.notify();
    return { success: true };
  }

  public deleteExpense(id: string): { success: boolean } {
    this.db.expenses = (this.db.expenses || []).filter((e) => e.id !== id);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Conselho de Turma — notas, rascunho, homologação e recuperação
  // ------------------------------------------------------------------
  private councilCtxFor(cls: ClassRoom): CouncilContext {
    return {
      cls,
      subjects: this.db.subjects || [],
      rules: normalizeGradeRules(this.db.settings?.gradeRules as any),
      currentTrimester: this.db.settings?.currentTrimester
    };
  }

  public applyCouncilStudentGrades(input: {
    classId: string; studentId: string; rows: Record<string, Record<string, any>>; reason?: string;
  }): { success: boolean; error?: string; changes?: CouncilGradeChange[] } {
    const cls = (this.db.classes || []).find((c) => String(c.id) === String(input.classId));
    if (!cls) return { success: false, error: 'Turma não encontrada.' };
    const student = (this.db.students || []).find((s) => String(s.id) === String(input.studentId));
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    const year = cls.academicYear || this.currentAcademicYearValue();
    const locked = (this.db.classCouncils || []).find((c) => String(c.classId) === String(cls.id) && c.academicYear === year && c.status === 'homologado');
    if (locked) return { success: false, error: 'Conselho homologado: as notas já não podem ser alteradas.' };
    if (studentExitKind(student)) return { success: false, error: 'Este aluno saiu da turma (transferido ou desistente): as notas já não podem ser alteradas.' };

    const ctx = this.councilCtxFor(cls);
    const regime = councilRegime(cls);
    const allowed = new Set(editableFieldsOf(regime));
    const classStudents = (this.db.students || []).filter((s) => String(s.classId) === String(cls.id));
    const by = this.currentActorName();
    const at = new Date().toISOString();
    const changes: CouncilGradeChange[] = [];
    const pending: Array<{ subject: Subject; full: StudentMiniPautaItem[]; mine: StudentMiniPautaItem }> = [];

    // 1.º passo: valida tudo e calcula (nada é gravado se alguma nota for inválida).
    for (const [subjectId, edits] of Object.entries(input.rows || {})) {
      const subject = (this.db.subjects || []).find((s) => String(s.id) === String(subjectId));
      if (!subject) return { success: false, error: 'Disciplina desconhecida no boletim.' };
      const stored = (this.db.miniPautasStore?.[String(cls.id)]?.[String(subjectId)] || null) as StudentMiniPautaItem[] | null;
      const before = councilRowFor(student, subject, ctx, stored);
      const next: any = { ...before };
      for (const [field, raw] of Object.entries(edits || {})) {
        if (!allowed.has(field)) return { success: false, error: `Campo de nota inválido: ${field}.` };
        if (raw !== '' && raw !== null && raw !== undefined) {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
          if (!Number.isFinite(n)) return { success: false, error: `Nota inválida em ${fieldLabel(field)}.` };
        }
        next[field] = sanitizeGradeInput(raw as any, fieldMax(field, regime));
      }
      const diff = diffGradeRows(before, next, regime);
      if (!diff.length) continue;
      const recalculated = recalcCouncilRow(next, subject, ctx);
      const full: StudentMiniPautaItem[] = stored && stored.length
        ? [...stored]
        : buildMiniPautaRows(classStudents, String(subject.id), [], undefined, ctx.rules, { regime, classGrade: cls.grade, isKeySubject: isKeySubjectFor(subject, cls.grade, cls.area), subjectName: subject.name });
      const idx = full.findIndex((r) => String(r.studentId) === String(student.id));
      if (idx >= 0) full[idx] = recalculated; else full.push(recalculated);
      pending.push({ subject, full, mine: recalculated });
      diff.forEach((d) => changes.push({
        id: this.newId('alt'), studentId: String(student.id), studentName: student.name,
        subjectId: String(subject.id), subjectName: subject.name, field: d.field, label: d.label,
        from: d.from, to: d.to, reason: input.reason?.trim() || undefined, by, at
      }));
    }
    if (!pending.length) return { success: true, changes: [] };

    // 2.º passo: grava. A Mini-Pauta guarda a turma inteira, mas só o aluno alterado
    // é sincronizado para as notas "vivas" (as que a Pauta Final lê).
    for (const p of pending) {
      this.saveMiniPautaRows(String(cls.id), String(p.subject.id), [p.mine], by);
      if (!this.db.miniPautasStore) this.db.miniPautasStore = {};
      if (!this.db.miniPautasStore[String(cls.id)]) this.db.miniPautasStore[String(cls.id)] = {};
      this.db.miniPautasStore[String(cls.id)][String(p.subject.id)] = p.full;
    }
    return { success: true, changes };
  }

  public saveClassCouncil(input: { classId: string; date: string; entries: ClassCouncilStudentEntry[]; gradeChanges?: CouncilGradeChange[] }): { success: boolean; error?: string; council?: ClassCouncilRecord } {
    const cls = (this.db.classes || []).find((c) => String(c.id) === String(input.classId));
    if (!cls) return { success: false, error: 'Turma não encontrada.' };
    const year = cls.academicYear || this.currentAcademicYearValue();
    const list = this.db.classCouncils || [];
    const existing = list.find((c) => String(c.classId) === String(cls.id) && c.academicYear === year);
    if (existing?.status === 'homologado') return { success: false, error: 'Conselho homologado: já não pode ser alterado.' };
    const council: ClassCouncilRecord = {
      id: existing?.id || this.newId('conselho'),
      academicYear: year, classId: String(cls.id), className: cls.name, grade: cls.grade,
      date: input.date || existing?.date || new Date().toISOString().slice(0, 10),
      entries: input.entries || [],
      gradeChanges: [...(existing?.gradeChanges || []), ...(input.gradeChanges || [])],
      status: 'rascunho',
      createdBy: existing?.createdBy || this.currentActorName(),
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    this.db.classCouncils = existing ? list.map((c) => (c.id === council.id ? council : c)) : [council, ...list];
    this.notify();
    return { success: true, council };
  }

  public homologateClassCouncil(id: string): { success: boolean; error?: string } {
    const council = (this.db.classCouncils || []).find((c) => c.id === id);
    if (!council) return { success: false, error: 'Conselho não encontrado.' };
    if (council.status === 'homologado') return { success: false, error: 'O conselho já está homologado.' };
    for (const e of council.entries) {
      const missing = e.incomplete || (e.reasons || []).some((r) => r.startsWith('Faltam notas'));
      if (missing && !(e.justification || '').trim()) {
        return { success: false, error: `Faltam notas de ${e.studentName}: escreva a justificação para homologar mesmo assim.` };
      }
      if (e.decision !== e.proposed && !(e.justification || '').trim()) {
        return { success: false, error: `Indique a justificação da decisão de ${e.studentName}, que difere da proposta automática.` };
      }
    }
    const actor = this.currentActorName();
    const now = new Date().toISOString();
    // Recuperação: só alunos com decisão condicional, só negativas ainda não recuperadas em recurso.
    const records = [...(this.db.recoveryRecords || [])];
    for (const e of council.entries) {
      if (e.decision !== 'condicional') continue;
      for (const n of e.negatives || []) {
        if (n.recovered) continue;
        if (!isEligibleForRecovery(n.grade)) continue;
        const dup = records.some((r) => r.academicYear === council.academicYear && String(r.studentId) === String(e.studentId) && String(r.subjectId) === String(n.subjectId));
        if (dup) continue;
        const base = advanceRecovery({ originalGrade: n.grade, stage: 'inscrito', outcome: 'pendente' } as any);
        records.push({
          id: this.newId('rec'), academicYear: council.academicYear, studentId: String(e.studentId), studentName: e.studentName,
          classId: council.classId, className: council.className, subjectId: String(n.subjectId), subjectName: n.subjectName,
          originalGrade: n.grade, stage: base.stage, outcome: base.outcome, createdBy: actor, createdAt: now
        });
      }
    }
    this.db.recoveryRecords = records;
    this.db.classCouncils = (this.db.classCouncils || []).map((c) => (c.id === id ? { ...c, status: 'homologado' as const, homologatedBy: actor, homologatedAt: now } : c));
    this.addAuditLog({
      userName: actor, userRole: 'Utilizador', action: 'Conselho de turma homologado',
      details: `${council.className} · ${council.academicYear}`, module: 'pedagogico', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
    } as any);
    this.notify();
    return { success: true };
  }

  public setRecoveryGrades(id: string, grades: { recoveryGrade?: number | ''; appealExamGrade?: number | '' }): { success: boolean; error?: string } {
    const rec = (this.db.recoveryRecords || []).find((r) => r.id === id);
    if (!rec) return { success: false, error: 'Processo de recuperação não encontrado.' };
    if (rec.stage === 'concluido') return { success: false, error: 'O processo já está concluído.' };
    const next: RecoveryRecord = { ...rec };
    if (grades.recoveryGrade !== undefined) {
      const n = Number(grades.recoveryGrade);
      if (!Number.isFinite(n) || n < 0 || n > 20) return { success: false, error: 'A nota de recuperação tem de estar entre 0 e 20.' };
      if (rec.stage !== 'recuperacao') return { success: false, error: 'A recuperação já foi lançada.' };
      next.recoveryGrade = n;
    }
    if (grades.appealExamGrade !== undefined) {
      const n = Number(grades.appealExamGrade);
      if (!Number.isFinite(n) || n < 0 || n > 20) return { success: false, error: 'A nota do exame de recurso tem de estar entre 0 e 20.' };
      if (rec.stage !== 'exame_recurso') return { success: false, error: 'O exame de recurso só se lança depois de a recuperação ficar negativa.' };
      next.appealExamGrade = n;
    }
    const adv = advanceRecovery(next as any);
    const updated: RecoveryRecord = { ...next, stage: adv.stage, outcome: adv.outcome, updatedAt: new Date().toISOString() };
    this.db.recoveryRecords = (this.db.recoveryRecords || []).map((r) => (r.id === id ? updated : r));
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Documentos académicos (Estúdio de Documentos)
  // ------------------------------------------------------------------
  public issueAcademicDocument(input: {
    studentId: string; type: AcademicDocType; academicYear?: string; purpose?: string;
    person?: { kind: 'professor' | 'funcionario'; id: string; name: string; number?: string };
    snapshot?: Record<string, any>;
  }): { success: boolean; error?: string; document?: AcademicDocument } {
    let name = ''; let proc = ''; let id = String(input.studentId || '');
    if (input.person) {
      name = input.person.name; proc = input.person.number || ''; id = String(input.person.id);
    } else {
      const st = (this.db.students || []).find((s) => String(s.id) === id);
      if (!st) return { success: false, error: 'Aluno não encontrado.' };
      name = st.name; proc = st.procNumber;
    }
    if (!DOC_PREFIX[input.type]) return { success: false, error: 'Tipo de documento desconhecido.' };
    const list = this.db.academicDocuments || [];
    const now = new Date();
    const year = now.getFullYear();
    const seq = nextDocSequence(list as any, input.type, year);
    const number = formatDocNumber(input.type, year, seq);
    const issuedAt = now.toISOString();
    const doc: AcademicDocument = {
      id: this.newId('doc'), number, type: input.type, year, seq, studentId: id, studentName: name, studentProcNumber: proc,
      academicYear: input.academicYear || undefined, purpose: input.purpose?.trim() || undefined,
      verificationCode: docVerificationCode(number, id, issuedAt), status: 'emitido', issuedAt, issuedBy: this.currentActorName(),
      personKind: input.person?.kind || 'aluno', studioSnapshot: input.snapshot
    };
    this.db.academicDocuments = [doc, ...list];
    this.addAuditLog({
      userName: this.currentActorName(), userRole: 'Utilizador', action: 'Documento académico emitido',
      details: `${DOC_LABEL[input.type]} ${number} · ${name}`, module: 'secretaria', timestamp: 'Agora mesmo', badgeColor: '#0b1f3a'
    } as any);
    this.notify();
    return { success: true, document: doc };
  }

  public updateAcademicDocumentSnapshot(id: string, snapshot: Record<string, any>): { success: boolean } {
    this.db.academicDocuments = (this.db.academicDocuments || []).map((d) => (d.id === id ? { ...d, studioSnapshot: snapshot } : d));
    this.notify();
    return { success: true };
  }

  public voidAcademicDocument(id: string, reason: string): { success: boolean; error?: string } {
    const doc = (this.db.academicDocuments || []).find((d) => d.id === id);
    if (!doc) return { success: false, error: 'Documento não encontrado.' };
    if (doc.status === 'anulado') return { success: false, error: 'O documento já está anulado.' };
    if (!(reason || '').trim()) return { success: false, error: 'Indique o motivo da anulação.' };
    this.db.academicDocuments = (this.db.academicDocuments || []).map((d) =>
      d.id === id ? { ...d, status: 'anulado' as const, voidedAt: new Date().toISOString(), voidedBy: this.currentActorName(), voidReason: reason.trim() } : d);
    this.addAuditLog({
      userName: this.currentActorName(), userRole: 'Utilizador', action: 'Documento académico anulado',
      details: `${doc.number} · ${reason.trim()}`, module: 'secretaria', timestamp: 'Agora mesmo', badgeColor: '#ac332b'
    } as any);
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Matrículas: edição e verificação de duplicados
  // ------------------------------------------------------------------
  public findMatriculaInAcademicYear(studentId: string, academicYear: string): Matricula | undefined {
    return (this.db.matriculas || []).find((m) =>
      String(m.studentId) === String(studentId) && m.academicYear === academicYear && m.estado !== 'cancelada' && m.estado !== 'transferida');
  }

  public editMatricula(id: string, updates: Partial<Matricula> & { classId?: string }): { success: boolean; error?: string; matricula?: Matricula } {
    const current = (this.db.matriculas || []).find((m) => m.id === id);
    if (!current) return { success: false, error: 'Matrícula não encontrada.' };
    const next: Matricula = { ...current, ...updates } as Matricula;
    if (updates.classId && String(updates.classId) !== String(current.classId)) {
      const cls = (this.db.classes || []).find((c) => String(c.id) === String(updates.classId));
      if (!cls) return { success: false, error: 'Turma não encontrada.' };
      next.classId = String(cls.id);
      next.className = cls.name;
      next.grade = cls.grade;
      next.shift = cls.shift;
      next.classroomRoom = cls.room;
    }
    this.db.matriculas = (this.db.matriculas || []).map((m) => (m.id === id ? next : m));
    const student = (this.db.students || []).find((s) => String(s.id) === String(next.studentId));
    if (student && next.academicYear === this.currentAcademicYearValue() && next.estado !== 'cancelada' && next.estado !== 'transferida') {
      this.updateStudent(student.id, { classId: next.classId, className: next.className, grade: next.grade } as Partial<Student>);
    }
    this.syncClassStudentCounts();
    this.notify();
    return { success: true, matricula: next };
  }

  // ------------------------------------------------------------------
  // Transferências & Equivalências
  // ------------------------------------------------------------------
  private institutionIdValue(): string {
    return this.activeInstitutionId;
  }

  private nextTransferCode(): string {
    const year = new Date().getFullYear();
    const n = (this.db.studentTransfers || []).filter((t) => (t.code || '').startsWith(`TRF-${year}-`)).length + 1;
    return `TRF-${year}-${String(n).padStart(4, '0')}`;
  }

  private buildHistorySnapshot(student: Student): StudentTransfer['historySnapshot'] {
    return {
      grade: student.grade || '', className: student.className || '', academicYear: this.currentAcademicYearValue(),
      enrollments: (this.db.matriculas || []).filter((m) => String(m.studentId) === String(student.id))
        .map((m) => ({ academicYear: m.academicYear, numeroMatricula: m.numeroMatricula, grade: m.grade, status: m.estado })),
      grades: JSON.parse(JSON.stringify(student.trimesterGrades || []))
    };
  }

  private closeStudentEnrollment(student: Student, estado: 'cancelada' | 'transferida'): void {
    const year = this.currentAcademicYearValue();
    this.db.matriculas = (this.db.matriculas || []).map((m) =>
      String(m.studentId) === String(student.id) && m.academicYear === year && m.estado !== 'cancelada' && m.estado !== 'transferida' ? { ...m, estado } : m);
  }

  public async transferOutStudent(input: { studentId: string; date: string; reason: string; institution: TransferInstitutionRef }): Promise<{ success: boolean; error?: string; transfer?: StudentTransfer; deliveryWarning?: string }> {
    const student = (this.db.students || []).find((s) => String(s.id) === String(input.studentId));
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    if (student.status === 'transferred') return { success: false, error: 'O aluno já foi transferido.' };
    if (!input.institution?.name?.trim()) return { success: false, error: 'Indique a escola de destino.' };
    const owed = outstandingInvoices((this.db.invoices || []) as any, String(student.id), new Date().toISOString().slice(0, 10));
    if (owed.length) return { success: false, error: `O aluno tem ${owed.length} fatura(s) em atraso (${sumOutstanding(owed as any).toLocaleString('pt-PT')} Kz). Regularize antes de transferir.` };

    const year = new Date().getFullYear();
    const guideNumber = formatGuideNumber(year, nextGuideSeq((this.db.studentTransfers || []).map((t) => t.guideNumber), year));
    const pkg: TransferPackage = {
      guideNumber, fromInstitutionId: this.institutionIdValue(), fromInstitutionName: this.db.settings?.schoolName || 'Instituição de Ensino',
      date: input.date, reason: input.reason || '', academicYear: this.currentAcademicYearValue(),
      grade: student.grade || '', className: student.className || undefined,
      student: {
        name: student.name, birthDate: (student as any).birthDate || '', gender: (student as any).gender, nationality: (student as any).nationality,
        birthPlace: (student as any).birthPlace, biNumber: (student as any).biNumber, nif: (student as any).nif, address: (student as any).address,
        email: (student as any).email, studentPhone: (student as any).studentPhone, guardianName: (student as any).guardianName,
        guardianPhone: (student as any).guardianPhone, guardianEmail: (student as any).guardianEmail, guardianNif: (student as any).guardianNif,
        guardianRelation: (student as any).guardianRelation, procNumber: student.procNumber
      },
      trimesterGrades: completedTrimesterGrades(student.trimesterGrades)
    };
    const problems = validateTransferPackage(pkg);
    if (problems.length) return { success: false, error: problems[0] };

    const transfer: StudentTransfer = {
      id: this.newId('transf'), code: this.nextTransferCode(), kind: 'transferencia_saida', studentId: String(student.id),
      studentName: student.name, studentProcNumber: student.procNumber, date: input.date, otherSchool: input.institution.name.trim(),
      reason: input.reason || '', historySnapshot: this.buildHistorySnapshot(student), status: 'concluido',
      otherInstitution: input.institution, package: pkg, guideNumber, deliveryStatus: 'nao_aplicavel',
      decidedBy: this.currentActorName(), decidedAt: new Date().toISOString(), createdBy: this.currentActorName(), createdAt: new Date().toISOString()
    };

    let deliveryWarning: string | undefined;
    if (input.institution.kind === 'conhecida' && input.institution.institutionId) {
      const delivered = await this.deliverTransferPackage(input.institution.institutionId, pkg);
      if (delivered.ok) { transfer.deliveryStatus = 'entregue'; transfer.deliveredRequestId = delivered.requestId; }
      else { transfer.deliveryStatus = 'falhou'; deliveryWarning = `Aluno transferido, mas os dados não chegaram à escola de destino (${delivered.error}). Use "Reenviar" ou entregue a Guia em mão.`; }
    }

    this.updateStudent(student.id, { status: 'transferred' } as Partial<Student>);
    this.closeStudentEnrollment(student, 'transferida');
    this.syncClassStudentCounts();
    this.db.studentTransfers = [transfer, ...(this.db.studentTransfers || [])];
    this.addAuditLog({
      userName: this.currentActorName(), userRole: 'Utilizador', action: 'Transferência de saída',
      details: `${student.name} → ${transfer.otherSchool} (${guideNumber})`, module: 'secretaria', timestamp: 'Agora mesmo', badgeColor: '#ac332b'
    } as any);
    this.addNotification({
      title: 'Aluno transferido para outra escola', message: `${student.name} → ${transfer.otherSchool} (guia ${guideNumber}).`,
      type: 'academic', priority: 'normal', targetRoles: SchoolDatabaseService.INBOX_ROLES, linkView: 'transferencias'
    });
    this.notify();
    return { success: true, transfer, deliveryWarning };
  }

  private async deliverTransferPackage(toInstitutionId: string, pkg: TransferPackage, requestId?: string): Promise<{ ok: boolean; requestId?: string; error?: string }> {
    try {
      const id = requestId || this.newId('tr');
      const request: IncomingTransferRequest = {
        id, toInstitutionId, fromInstitutionId: pkg.fromInstitutionId, package: JSON.parse(JSON.stringify(pkg)),
        status: 'pendente', createdAt: new Date().toISOString()
      };
      await cloud.sendTransfer(pkg.fromInstitutionId, toInstitutionId, shardStripUndefined(request));
      return { ok: true, requestId: id };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'sem ligação' };
    }
  }

  public async resendTransfer(id: string): Promise<{ success: boolean; error?: string }> {
    const t = (this.db.studentTransfers || []).find((x) => x.id === id);
    if (!t || !t.package) return { success: false, error: 'Transferência não encontrada.' };
    const to = t.otherInstitution?.institutionId;
    if (!to) return { success: false, error: 'Esta escola de destino não está registada no sistema: entregue a Guia em mão.' };
    const r = await this.deliverTransferPackage(to, t.package, t.deliveredRequestId);
    if (!r.ok) return { success: false, error: `Não foi possível reenviar (${r.error}).` };
    this.db.studentTransfers = (this.db.studentTransfers || []).map((x) => (x.id === id ? { ...x, deliveryStatus: 'entregue' as const, deliveredRequestId: r.requestId } : x));
    this.notify();
    return { success: true };
  }

  public async loadKnownInstitutions(): Promise<InstitutionSummary[]> {
    const own = this.institutionIdValue();
    let list: InstitutionSummary[] = this.getInstitutionsIndex();
    try {
      const rows = await cloud.listInstitutionsRpc();
      if (rows.length > 0) {
        list = rows.map((r) => ({ id: r.id, name: r.name, adminEmail: '', adminName: '', createdAt: r.created_at }));
      }
    } catch { /* usa o índice local */ }
    return list.filter((i) => i && i.id && i.id !== own);
  }

  public subscribeIncomingTransfers(cb: (list: IncomingTransferRequest[], error?: string) => void): () => void {
    const own = this.institutionIdValue();
    try {
      return cloud.listenIncomingTransfers(
        own,
        (rows) => {
          const list = (rows as IncomingTransferRequest[]).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          cb(list);
        },
        (err: any) => cb([], `Não foi possível ler os pedidos recebidos (${err?.message || 'sem permissão'}).`)
      );
    } catch (e: any) {
      cb([], `Não foi possível ler os pedidos recebidos (${e?.message || 'erro'}).`);
      return () => {};
    }
  }

  /** Decisão da escola de destino para cada transferência de saída entregue (chave = id do pedido). */
  public async loadSentTransferDecisions(): Promise<Record<string, { status: string; decisionNote?: string; decidedAt?: string; decidedBy?: string }>> {
    const rows = await cloud.listSentTransfers(this.institutionIdValue());
    const out: Record<string, { status: string; decisionNote?: string; decidedAt?: string; decidedBy?: string }> = {};
    rows.forEach((r) => { out[r.id] = r; });
    return out;
  }

  public async decideIncomingTransfer(id: string, accept: boolean, note?: string): Promise<{ success: boolean; error?: string }> {
    const own = this.institutionIdValue();
    if (!accept && !(note || '').trim()) return { success: false, error: 'Indique o motivo da recusa.' };
    try {
      await cloud.patchTransfer(own, id, shardStripUndefined({
        status: accept ? 'aceite' : 'recusada', decidedBy: this.currentActorName(), decidedAt: new Date().toISOString(), decisionNote: note?.trim() || null
      }));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: `Não foi possível registar a decisão (${e?.message || 'sem permissão'}).` };
    }
  }

  // ---------------------------------------------------------------------------
  // Caixa de entrada: avisos de ADMISSÃO e TRANSFERÊNCIA de alunos
  // ---------------------------------------------------------------------------
  private static readonly INBOX_ROLES: UserRole[] = ['admin', 'director', 'secretaria'];

  private inboxSeenKey(): string { return `bandmed:inbox_seen:${this.institutionIdValue()}`; }

  private loadInboxSeen(): Set<string> | null {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.inboxSeenKey()) : null;
      return raw ? new Set<string>(JSON.parse(raw)) : null;
    } catch { return null; }
  }

  private saveInboxSeen(seen: Set<string>) {
    try { localStorage.setItem(this.inboxSeenKey(), JSON.stringify(Array.from(seen).slice(-500))); } catch { /* ignora */ }
  }

  /** Cria (uma só vez por pedido) o aviso na caixa de entrada da Secretaria/Direcção/Admin. */
  private notifyOnce(seen: Set<string>, key: string, n: { title: string; message: string; type?: SchoolNotification['type']; priority?: SchoolNotification['priority']; linkView: string }) {
    if (seen.has(key)) return;
    seen.add(key);
    this.addNotification({ id: `notif-${key}`, type: n.type || 'academic', priority: n.priority || 'alta', targetRoles: SchoolDatabaseService.INBOX_ROLES, ...n });
  }

  /**
   * Vigia pedidos que chegam de fora: admissões online (formulário público) e transferências enviadas por outras
   * escolas. Cada pedido novo gera UM aviso na caixa de entrada. Devolve a função para parar o vigia.
   */
  public startInboxWatchers(): () => void {
    const seen = this.loadInboxSeen() || new Set<string>();
    const firstRun = !this.loadInboxSeen();
    let stopped = false;
    let first = firstRun;

    const checkAdmissions = async () => {
      if (stopped) return;
      const list = await this.getPendingOnlineAdmissionRequests();
      const fresh = list.filter((r) => !seen.has(`adm-${r.id}`));
      if (!fresh.length) return;
      if (first && fresh.length > 3) {
        // Primeira ligação com muitos pedidos acumulados: um único resumo, sem inundar a caixa.
        fresh.forEach((r) => seen.add(`adm-${r.id}`));
        this.notifyOnce(seen, `adm-batch-${Date.now()}`, { title: `${fresh.length} pedidos de admissão online por tratar`, message: 'Abra Admissão para rever e importar os pedidos recebidos pelo formulário público.', linkView: 'admissoes' });
      } else {
        fresh.slice(0, 10).forEach((r) => this.notifyOnce(seen, `adm-${r.id}`, {
          title: 'Novo pedido de admissão online',
          message: `${r.name || 'Candidato'} — ${r.desiredGrade || 'classe por definir'}${r.desiredCourse ? ` (${r.desiredCourse})` : ''}`,
          linkView: 'admissoes'
        }));
      }
      first = false;
      this.saveInboxSeen(seen);
    };

    void checkAdmissions();
    const timer = setInterval(() => { void checkAdmissions(); }, 60000);

    let unsubTransfers = () => {};
    try {
      unsubTransfers = this.subscribeIncomingTransfers((list) => {
        if (stopped) return;
        const pend = list.filter((t) => t.status === 'pendente' && !seen.has(`trf-in-${t.id}`));
        pend.forEach((t) => this.notifyOnce(seen, `trf-in-${t.id}`, {
          title: 'Pedido de transferência recebido',
          message: `${t.package?.student?.name || 'Aluno'} vem de ${t.package?.fromInstitutionName || 'outra escola'} (guia ${t.package?.guideNumber || '—'}). Reveja e aceite ou recuse.`,
          linkView: 'transferencias', priority: 'urgente'
        }));
        if (pend.length) this.saveInboxSeen(seen);
      });
    } catch { /* sem ligação: o vigia de admissões continua */ }

    return () => { stopped = true; clearInterval(timer); unsubTransfers(); };
  }

  public async completeTransferEntry(input: {
    studentId: string; matriculaId: string; institution: TransferInstitutionRef; guideNumber: string; date: string; reason: string;
    grades: TransferredSubjectGrades[]; requestId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const student = (this.db.students || []).find((s) => String(s.id) === String(input.studentId));
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    const records = transferredGradesToRecords((input.grades || []).filter((g) => g.subjectName?.trim()), input.institution.name);
    if (records.length) {
      const live = [...(student.trimesterGrades || [])];
      for (const r of records) {
        const i = live.findIndex((x) => normSubject(x.subjectName) === normSubject(r.subjectName));
        if (i >= 0) live[i] = r; else live.push(r);
      }
      this.updateStudent(student.id, { trimesterGrades: live, trimesterGradesYear: this.currentAcademicYearValue() } as Partial<Student>);
    }
    const transfer: StudentTransfer = {
      id: this.newId('transf'), code: this.nextTransferCode(), kind: 'transferencia_entrada', studentId: String(student.id),
      studentName: student.name, studentProcNumber: student.procNumber, date: input.date, otherSchool: input.institution.name,
      reason: input.reason || '', historySnapshot: this.buildHistorySnapshot((this.db.students || []).find((s) => String(s.id) === String(student.id)) || student),
      status: 'concluido', otherInstitution: input.institution, guideNumber: input.guideNumber, matriculaId: input.matriculaId,
      decidedBy: this.currentActorName(), decidedAt: new Date().toISOString(), createdBy: this.currentActorName(), createdAt: new Date().toISOString()
    };
    this.db.studentTransfers = [transfer, ...(this.db.studentTransfers || [])];
    this.addNotification({
      title: 'Aluno admitido por transferência', message: `${student.name} entrou vindo de ${input.institution.name} (guia ${input.guideNumber}).`,
      type: 'academic', priority: 'normal', targetRoles: SchoolDatabaseService.INBOX_ROLES, linkView: 'transferencias'
    });
    this.notify();
    if (input.requestId) {
      try {
        await cloud.patchTransfer(this.institutionIdValue(), input.requestId, { status: 'concluida', studentId: String(student.id) });
      } catch { /* o pedido fica como "aceite"; a matrícula já está concluída */ }
    }
    return { success: true };
  }

  public registerStudentTransfer(input: { kind: 'anulacao_matricula'; studentId: string; date: string; reason: string }): { success: boolean; error?: string; transfer?: StudentTransfer } {
    const student = (this.db.students || []).find((s) => String(s.id) === String(input.studentId));
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    const year = this.currentAcademicYearValue();
    const mat = (this.db.matriculas || []).find((m) => String(m.studentId) === String(student.id) && m.academicYear === year && m.estado !== 'cancelada' && m.estado !== 'transferida');
    if (!mat) return { success: false, error: 'O aluno não tem matrícula ativa neste ano letivo.' };
    const transfer: StudentTransfer = {
      id: this.newId('transf'), code: this.nextTransferCode(), kind: 'anulacao_matricula', studentId: String(student.id),
      studentName: student.name, studentProcNumber: student.procNumber, date: input.date, reason: input.reason || '',
      historySnapshot: this.buildHistorySnapshot(student), status: 'concluido',
      decidedBy: this.currentActorName(), decidedAt: new Date().toISOString(), createdBy: this.currentActorName(), createdAt: new Date().toISOString()
    };
    this.closeStudentEnrollment(student, 'cancelada');
    this.updateStudent(student.id, { classId: '', className: '' } as Partial<Student>);
    this.syncClassStudentCounts();
    this.db.studentTransfers = [transfer, ...(this.db.studentTransfers || [])];
    this.notify();
    return { success: true, transfer };
  }

  public addSubjectEquivalence(input: { originSubject: string; originPlan?: string; destSubject: string }): { success: boolean; error?: string } {
    if (!input.originSubject?.trim() || !input.destSubject?.trim()) return { success: false, error: 'Indique a disciplina de origem e a de destino.' };
    const list = this.db.subjectEquivalences || [];
    const key = normSubject(input.originSubject);
    if (list.some((e) => normSubject(e.originSubject) === key && normSubject(e.originPlan) === normSubject(input.originPlan))) {
      return { success: false, error: 'Já existe uma equivalência para esta disciplina de origem.' };
    }
    const subject = (this.db.subjects || []).find((s) => normSubject(s.name) === normSubject(input.destSubject));
    const eq: SubjectEquivalence = {
      id: this.newId('equiv'), originSubject: input.originSubject.trim(), originPlan: input.originPlan?.trim() || undefined,
      destSubject: input.destSubject.trim(), destSubjectId: subject ? String(subject.id) : undefined,
      createdBy: this.currentActorName(), createdAt: new Date().toISOString()
    };
    this.db.subjectEquivalences = [...list, eq];
    this.notify();
    return { success: true };
  }

  public removeSubjectEquivalence(id: string): { success: boolean } {
    this.db.subjectEquivalences = (this.db.subjectEquivalences || []).filter((e) => e.id !== id);
    this.notify();
    return { success: true };
  }

  public applyStudentEquivalences(input: {
    studentId: string; originLabel: string; subjects: Array<{ subjectName: string; grade?: number }>;
    destPlanSubjects?: string[]; missingFromGrade?: string; maxDependencies?: number;
  }): { success: boolean; error?: string; recognized: number; dependencies: number } {
    const fail = (error: string) => ({ success: false, error, recognized: 0, dependencies: 0 });
    const student = (this.db.students || []).find((s) => String(s.id) === String(input.studentId));
    if (!student) return fail('Aluno não encontrado.');
    const outcome = applyEquivalences(input.subjects, this.db.subjectEquivalences || [], input.destPlanSubjects || []);
    const pending = pendingDependencies(this.db.studentDependencies, String(student.id)).length;
    const limit = dependencyLimitCheck(pending, outcome.missingForDependency.length, input.maxDependencies);
    if (!limit.allowed) return fail(limit.message || 'Limite de disciplinas em atraso excedido.');
    const live = [...(student.trimesterGrades || [])];
    for (const r of outcome.recognized) {
      const subject = (this.db.subjects || []).find((s) => normSubject(s.name) === normSubject(r.destSubject));
      const rec = equivalenceToRecord(r.destSubject, r.grade, input.originLabel, subject ? String(subject.id) : undefined);
      const i = live.findIndex((x) => normSubject(x.subjectName) === normSubject(r.destSubject));
      if (i >= 0) live[i] = rec; else live.push(rec);
    }
    if (outcome.recognized.length) this.updateStudent(student.id, { trimesterGrades: live, trimesterGradesYear: this.currentAcademicYearValue() } as Partial<Student>);
    const now = new Date().toISOString();
    const deps: StudentDependency[] = outcome.missingForDependency.map((name) => ({
      id: this.newId('dep'), studentId: String(student.id), studentName: student.name, subjectName: name,
      fromGrade: input.missingFromGrade || '', academicYear: this.currentAcademicYearValue(), status: 'pendente', origin: 'equivalencia',
      createdBy: this.currentActorName(), createdAt: now
    }));
    if (deps.length) this.db.studentDependencies = [...deps, ...(this.db.studentDependencies || [])];
    this.notify();
    return { success: true, recognized: outcome.recognized.length, dependencies: deps.length };
  }

  public resolveDependency(id: string): { success: boolean } {
    this.db.studentDependencies = (this.db.studentDependencies || []).map((d) => (d.id === id ? { ...d, status: 'regularizada' as const, resolvedAt: new Date().toISOString() } : d));
    this.notify();
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Notificações em massa — envio pelo servidor (gateway SMS/WhatsApp)
  // ------------------------------------------------------------------
  public async dispatchNotificationViaGateway(id: string): Promise<{ success: boolean; error?: string }> {
    const current = (this.db.smsWhatsappNotifications || []).find((n) => n.id === id);
    if (!current) return { success: false, error: 'Notificação não encontrada.' };
    if (current.status === 'enviada') return { success: false, error: 'Esta notificação já foi enviada.' };
    const cfg = { url: this.db.settings?.integrations?.notifyGatewayUrl };
    if (!isGatewayConfigured(cfg)) return { success: false, error: 'O servidor de notificações não está configurado em Configurações → Integrações.' };
    const recipients = buildRecipientsForAudience(current.audienceType, this.db.students || [], this.db.teachers || [], this.db.funcionarios || [], current.classId, current.studentIds);
    if (!recipients.length) return { success: false, error: 'Não foram encontrados destinatários com telefone válido para o público-alvo escolhido.' };
    const { messages, invalid } = buildGatewayMessages(recipients.map((r) => ({ id: r.id, phone: r.phone })), current.channel, current.message);
    if (!messages.length) return { success: false, error: 'Nenhum destinatário tem um número de telefone válido.' };
    let token = '';
    try { token = (await supabase.auth.getSession()).data.session?.access_token || ''; } catch { token = ''; }
    if (!token) return { success: false, error: 'Sessão expirada: inicie sessão novamente para enviar mensagens.' };
    const results = await sendViaGateway(cfg, token, messages);
    const folded = foldResultsByRecipient(results);
    // Servidor em modo fila responde providerId 'fila': a mensagem foi aceite, ainda não enviada.
    const queuedIds = new Set(results.filter((x) => x.ok && x.providerId === 'fila').map((x) => x.id.split('#')[0]));
    const delivered = recipients.map((r) => {
      const res = folded.get(r.id);
      if (invalid.includes(r.id) || !res || !res.ok) return { ...r, deliveryStatus: 'falhou' as const };
      return { ...r, deliveryStatus: queuedIds.has(r.id) ? ('na_fila' as const) : ('entregue' as const) };
    });
    const sentCount = delivered.filter((r) => r.deliveryStatus === 'entregue' || r.deliveryStatus === 'na_fila').length;
    const failedCount = delivered.filter((r) => r.deliveryStatus === 'falhou').length;
    const updated: SmsWhatsappNotification = {
      ...current, status: sentCount > 0 ? 'enviada' : 'falhada', recipients: delivered, sentCount, failedCount, sentAt: new Date().toISOString()
    };
    this.db.smsWhatsappNotifications = (this.db.smsWhatsappNotifications || []).map((n) => (n.id === id ? updated : n));
    this.notify();
    if (sentCount === 0) {
      const firstErr = [...folded.values()].find((r) => !r.ok)?.error;
      return { success: false, error: firstErr || 'O fornecedor não aceitou nenhuma mensagem.' };
    }
    return { success: true };
  }
}

export const dbService = new SchoolDatabaseService();
