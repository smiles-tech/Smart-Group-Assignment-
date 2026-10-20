export interface Student {
  id: string;
  studentId: string;
  name: string;
  phone: string;
  groupNumber: number;
  isLeader: boolean;
  joinedAt: string;
  sessionToken?: string;
  exitedAt?: string | null;
}

export interface Group {
  groupNumber: number;
  name: string;
  leader: Student | null;
  members: Student[];
  maxMembers: number;
}

export interface CourseSession {
  id: string;
  courseCode: string;
  courseTitle: string;
  tutorName: string;
  tutorEmail: string;
  membersLimit: number;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  spreadsheetTitle: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  qrToken: string;
  qrTokenExpiresAt: number;
  allowedViewers: string[];
  students: Student[];
}

export interface GoogleDriveSheet {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export interface JoinSessionPayload {
  studentId: string;
  name: string;
  phone: string;
  token: string;
}

export interface StudentViewData {
  session: {
    id: string;
    courseCode: string;
    courseTitle: string;
    tutorName: string;
    membersLimit: number;
  };
  student: Student;
  groupNumber: number;
  groupName: string;
  isLeader: boolean;
  groupMembers: {
    studentId: string;
    name: string;
    phone: string;
    isLeader: boolean;
    joinedAt: string;
  }[];
  sessionToken: string;
}
