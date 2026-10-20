import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

// Data directory for persistence
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface Student {
  id: string;
  studentId: string;
  name: string;
  phone: string;
  groupNumber: number;
  isLeader: boolean;
  joinedAt: string;
  sessionToken?: string | null;
  exitedAt?: string | null;
}

interface CourseSession {
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

function generateQrToken(): { token: string; expiresAt: number } {
  const token = `qr_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  // QR code token valid for 15 minutes by default, tutor can also rotate at will
  const expiresAt = Date.now() + 15 * 60 * 1000;
  return { token, expiresAt };
}

// In-memory store initialized from disk
let sessions: Record<string, CourseSession> = {};

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    sessions = JSON.parse(raw);
  }
} catch (e) {
  console.warn('Could not read existing sessions from file:', e);
  sessions = {};
}

function persistSessions() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist sessions to disk:', err);
  }
}

// Active SSE client connections per session
const sseClients: Record<string, Set<Response>> = {};

function notifySessionUpdate(sessionId: string, payload?: any) {
  const clients = sseClients[sessionId];
  if (!clients || clients.size === 0) return;

  const data = JSON.stringify(payload || { type: 'updated', timestamp: Date.now() });
  for (const client of clients) {
    try {
      client.write(`event: update\ndata: ${data}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  // 0. Environment App URLs
  app.get('/api/config', (req: Request, res: Response) => {
    const appUrl = process.env.APP_URL || '';
    const devUrl = appUrl;
    const sharedUrl = appUrl.replace('ais-dev-', 'ais-pre-');
    res.json({
      appUrl,
      devUrl,
      sharedUrl,
    });
  });

  // 1. Get or list sessions (filtered by user access)
  app.get('/api/sessions', (req: Request, res: Response) => {
    const userEmail = (
      (req.query.userEmail as string) ||
      (req.headers['x-user-email'] as string) ||
      ''
    ).toLowerCase().trim();

    const list = Object.values(sessions).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // If email provided, flag role on each session
    const annotated = list.map((s) => {
      let role: 'owner' | 'viewer' | 'unauthorized' = 'owner';
      if (s.tutorEmail) {
        if (userEmail && s.tutorEmail.toLowerCase() === userEmail) {
          role = 'owner';
        } else if (
          userEmail &&
          (s.allowedViewers || []).some((v) => v.toLowerCase() === userEmail)
        ) {
          role = 'viewer';
        } else if (userEmail) {
          role = 'unauthorized';
        }
      }
      return { ...s, userRole: role };
    });

    res.json(annotated);
  });

  // 2. Create new session
  app.post('/api/sessions', (req: Request, res: Response) => {
    const {
      courseCode,
      courseTitle,
      tutorName,
      tutorEmail,
      membersLimit,
      spreadsheetId,
      spreadsheetUrl,
      spreadsheetTitle,
      allowedViewers,
    } = req.body;

    if (!courseCode || !courseTitle || !membersLimit) {
      return res.status(400).json({ error: 'Missing required course details' });
    }

    const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { token: qrToken, expiresAt: qrTokenExpiresAt } = generateQrToken();

    const cleanAllowedViewers = Array.isArray(allowedViewers)
      ? allowedViewers.map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : [];

    const newSession: CourseSession = {
      id,
      courseCode: courseCode.trim().toUpperCase(),
      courseTitle: courseTitle.trim(),
      tutorName: tutorName ? tutorName.trim() : 'Course Tutor',
      tutorEmail: tutorEmail ? tutorEmail.trim().toLowerCase() : '',
      membersLimit: Math.max(1, parseInt(membersLimit, 10) || 4),
      spreadsheetId: spreadsheetId || null,
      spreadsheetUrl: spreadsheetUrl || null,
      spreadsheetTitle: spreadsheetTitle || null,
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
      qrToken,
      qrTokenExpiresAt,
      allowedViewers: cleanAllowedViewers,
      students: [],
    };

    sessions[id] = newSession;
    persistSessions();
    res.status(201).json(newSession);
  });

  // 3. Refresh dynamic QR code token
  app.post('/api/sessions/:id/refresh-qr', (req: Request, res: Response) => {
    const { id } = req.params;
    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { token, expiresAt } = generateQrToken();
    session.qrToken = token;
    session.qrTokenExpiresAt = expiresAt;

    persistSessions();
    notifySessionUpdate(id, {
      type: 'qr_refreshed',
      qrToken: token,
      qrTokenExpiresAt: expiresAt,
    });

    res.json({
      qrToken: token,
      qrTokenExpiresAt: expiresAt,
    });
  });

  // 4. Update allowed viewer Google accounts permissions
  app.post('/api/sessions/:id/permissions', (req: Request, res: Response) => {
    const { id } = req.params;
    const { allowedViewers } = req.body;
    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (Array.isArray(allowedViewers)) {
      session.allowedViewers = allowedViewers
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);
      persistSessions();
      notifySessionUpdate(id, { type: 'permissions_updated', session });
    }

    res.json(session);
  });

  // 5. Get single session
  // Handles: Student privacy mode, QR token validation, and Google Account permissions
  app.get('/api/sessions/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { studentId, sessionToken, token: qrTokenParam, userEmail } = req.query;

    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // A. Check student privacy and session token expiration (URL expires when exited)
    if (studentId && typeof studentId === 'string') {
      const normalizedQueryId = studentId.trim().toLowerCase();
      const student = session.students.find(
        (s) => s.studentId.trim().toLowerCase() === normalizedQueryId
      );

      if (!student) {
        return res.status(404).json({ error: 'Student not found in this course session' });
      }

      // Check if session has been exited
      if (student.exitedAt) {
        return res.status(401).json({
          error: 'Access expired. You have exited this session. Please rescan the live QR code in class to rejoin.',
          isExited: true,
        });
      }

      // Validate session token if provided
      if (sessionToken && student.sessionToken && student.sessionToken !== sessionToken) {
        return res.status(401).json({
          error: 'Invalid session credentials. Please rescan the active QR code.',
          isExited: true,
        });
      }

      // Filter only members belonging to this student's group (Strict privacy)
      const groupMembers = session.students
        .filter((s) => s.groupNumber === student.groupNumber && !s.exitedAt)
        .map((s) => ({
          studentId: s.studentId,
          name: s.name,
          phone: s.phone,
          isLeader: s.isLeader,
          joinedAt: s.joinedAt,
        }));

      return res.json({
        session: {
          id: session.id,
          courseCode: session.courseCode,
          courseTitle: session.courseTitle,
          tutorName: session.tutorName,
          membersLimit: session.membersLimit,
        },
        student,
        groupNumber: student.groupNumber,
        groupName: `Group ${student.groupNumber}`,
        isLeader: student.isLeader,
        groupMembers,
        sessionToken: student.sessionToken || '',
      });
    }

    // B. Check QR token validation if accessed via QR URL
    if (qrTokenParam && typeof qrTokenParam === 'string') {
      const isExpired = Date.now() > session.qrTokenExpiresAt;
      const isValid = session.qrToken === qrTokenParam && !isExpired;

      if (!isValid) {
        return res.status(403).json({
          error: isExpired
            ? 'QR Code Expired: This dynamic QR code has expired. Please scan the active QR code displayed on the screen.'
            : 'Invalid QR Code: The QR code is no longer active.',
          qrExpired: true,
          courseCode: session.courseCode,
          courseTitle: session.courseTitle,
        });
      }

      // Return public course info for registration
      return res.json({
        id: session.id,
        courseCode: session.courseCode,
        courseTitle: session.courseTitle,
        tutorName: session.tutorName,
        membersLimit: session.membersLimit,
        qrTokenValid: true,
        expiresInSeconds: Math.max(0, Math.floor((session.qrTokenExpiresAt - Date.now()) / 1000)),
      });
    }

    // C. Administrative / Tutor / Permitted Google Account view
    const emailHeader = (
      (userEmail as string) ||
      (req.headers['x-user-email'] as string) ||
      ''
    ).toLowerCase().trim();

    let userRole: 'owner' | 'viewer' | 'unauthorized' = 'owner';

    if (session.tutorEmail) {
      if (emailHeader && session.tutorEmail.toLowerCase() === emailHeader) {
        userRole = 'owner';
      } else if (
        emailHeader &&
        (session.allowedViewers || []).some((v) => v.toLowerCase() === emailHeader)
      ) {
        userRole = 'viewer';
      } else if (emailHeader) {
        userRole = 'unauthorized';
      }
    }

    // If unauthorized Google account tried to view, restrict data
    if (userRole === 'unauthorized') {
      return res.status(403).json({
        error: 'Access Restricted',
        userRole: 'unauthorized',
        courseCode: session.courseCode,
        courseTitle: session.courseTitle,
        tutorName: session.tutorName,
        tutorEmail: session.tutorEmail,
        userEmail: emailHeader,
        message: `You are signed in as ${emailHeader}. You need permission from the course tutor (${session.tutorEmail}) to view this course dashboard.`,
      });
    }

    res.json({
      ...session,
      userRole,
    });
  });

  // 6. Update session settings
  app.patch('/api/sessions/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const {
      courseCode,
      courseTitle,
      tutorName,
      membersLimit,
      spreadsheetId,
      spreadsheetUrl,
      spreadsheetTitle,
      lastSyncedAt,
      allowedViewers,
    } = req.body;

    if (courseCode !== undefined) session.courseCode = courseCode.trim().toUpperCase();
    if (courseTitle !== undefined) session.courseTitle = courseTitle.trim();
    if (tutorName !== undefined) session.tutorName = tutorName.trim();
    if (membersLimit !== undefined) session.membersLimit = Math.max(1, parseInt(membersLimit, 10));
    if (spreadsheetId !== undefined) session.spreadsheetId = spreadsheetId;
    if (spreadsheetUrl !== undefined) session.spreadsheetUrl = spreadsheetUrl;
    if (spreadsheetTitle !== undefined) session.spreadsheetTitle = spreadsheetTitle;
    if (lastSyncedAt !== undefined) session.lastSyncedAt = lastSyncedAt;
    if (Array.isArray(allowedViewers)) {
      session.allowedViewers = allowedViewers.map((v: string) => v.trim().toLowerCase());
    }

    persistSessions();
    notifySessionUpdate(id, { type: 'session_updated', session });
    res.json(session);
  });

  // 7. Student joins via dynamic QR code and is automatically assigned
  app.post('/api/sessions/:id/join', (req: Request, res: Response) => {
    const { id } = req.params;
    const { studentId, name, phone, token: qrToken } = req.body;

    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Course session not found' });
    }

    // Validate dynamic QR token
    if (qrToken) {
      const isExpired = Date.now() > session.qrTokenExpiresAt;
      if (session.qrToken !== qrToken || isExpired) {
        return res.status(403).json({
          error: isExpired
            ? 'QR Code Expired: This QR code has expired. Please scan the active QR code displayed on the screen.'
            : 'Invalid QR Code: The QR link is no longer valid.',
          qrExpired: true,
        });
      }
    }

    if (!studentId || !name || !phone) {
      return res.status(400).json({ error: 'Please provide Student ID, Full Name, and Phone Number' });
    }

    const cleanStudentId = studentId.trim();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const normalizedId = cleanStudentId.toLowerCase();

    // Generate unique session token for URL expiration
    const studentSessionToken = `stok_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;

    // Check if student already registered in this session
    const existing = session.students.find(
      (s) => s.studentId.trim().toLowerCase() === normalizedId
    );

    let assignedStudent: Student;

    if (existing) {
      existing.name = cleanName;
      existing.phone = cleanPhone;
      existing.sessionToken = studentSessionToken;
      existing.exitedAt = null; // Re-activated
      assignedStudent = existing;
    } else {
      // Group assignment algorithm:
      // Fills Group 1 up to membersLimit, then Group 2, etc.
      // First person assigned to a group is designated isLeader = true.
      let targetGroup = 1;

      while (true) {
        const membersInGroup = session.students.filter(
          (s) => s.groupNumber === targetGroup && !s.exitedAt
        );
        if (membersInGroup.length < session.membersLimit) {
          const isLeader = membersInGroup.length === 0;
          assignedStudent = {
            id: `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            studentId: cleanStudentId,
            name: cleanName,
            phone: cleanPhone,
            groupNumber: targetGroup,
            isLeader,
            joinedAt: new Date().toISOString(),
            sessionToken: studentSessionToken,
            exitedAt: null,
          };
          session.students.push(assignedStudent);
          break;
        }
        targetGroup++;
      }
    }

    persistSessions();

    notifySessionUpdate(id, {
      type: 'student_joined',
      student: assignedStudent,
      totalStudents: session.students.filter((s) => !s.exitedAt).length,
    });

    const groupMembers = session.students
      .filter((s) => s.groupNumber === assignedStudent.groupNumber && !s.exitedAt)
      .map((s) => ({
        studentId: s.studentId,
        name: s.name,
        phone: s.phone,
        isLeader: s.isLeader,
        joinedAt: s.joinedAt,
      }));

    res.status(existing ? 200 : 201).json({
      session: {
        id: session.id,
        courseCode: session.courseCode,
        courseTitle: session.courseTitle,
        tutorName: session.tutorName,
        membersLimit: session.membersLimit,
      },
      student: assignedStudent,
      groupNumber: assignedStudent.groupNumber,
      groupName: `Group ${assignedStudent.groupNumber}`,
      isLeader: assignedStudent.isLeader,
      groupMembers,
      sessionToken: studentSessionToken,
    });
  });

  // 8. Student exits session -> URL expires immediately!
  app.post('/api/sessions/:id/exit', (req: Request, res: Response) => {
    const { id } = req.params;
    const { studentId, sessionToken } = req.body;

    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID required' });
    }

    const student = session.students.find(
      (s) => s.studentId.trim().toLowerCase() === studentId.trim().toLowerCase()
    );

    if (student) {
      // Mark as exited and invalidate session token
      student.exitedAt = new Date().toISOString();
      student.sessionToken = null;
      persistSessions();
      notifySessionUpdate(id, { type: 'student_exited', studentId });
    }

    res.json({
      success: true,
      message: 'You have exited the session. Access URL has expired.',
    });
  });

  // 9. Tutor removes student
  app.delete('/api/sessions/:id/students/:studentId', (req: Request, res: Response) => {
    const { id, studentId } = req.params;
    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const index = session.students.findIndex(
      (s) => s.studentId.trim().toLowerCase() === studentId.trim().toLowerCase()
    );

    if (index === -1) {
      return res.status(404).json({ error: 'Student not found in this session' });
    }

    const [removed] = session.students.splice(index, 1);

    if (removed.isLeader) {
      const remainingGroupMembers = session.students.filter(
        (s) => s.groupNumber === removed.groupNumber && !s.exitedAt
      );
      if (remainingGroupMembers.length > 0) {
        remainingGroupMembers[0].isLeader = true;
      }
    }

    persistSessions();
    notifySessionUpdate(id, { type: 'student_removed', studentId });
    res.json({ success: true, removedStudent: removed });
  });

  // 10. Sync students from Google Sheet into session
  app.post('/api/sessions/:id/sync-from-sheet', (req: Request, res: Response) => {
    const { id } = req.params;
    const { students } = req.body;

    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (Array.isArray(students)) {
      session.students = students;
      session.lastSyncedAt = new Date().toLocaleTimeString();
      persistSessions();
      notifySessionUpdate(id, { type: 'session_updated', session });
    }

    res.json(session);
  });

  // 11. Clear all students from session to reset roster
  app.delete('/api/sessions/:id/students', (req: Request, res: Response) => {
    const { id } = req.params;
    const session = sessions[id];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.students = [];
    session.lastSyncedAt = new Date().toLocaleTimeString();
    persistSessions();
    notifySessionUpdate(id, { type: 'session_updated', session });
    res.json({ success: true, message: 'Roster cleared' });
  });

  // 12. Server-Sent Events (SSE) Stream
  app.get('/api/sessions/:id/stream', (req: Request, res: Response) => {
    const { id } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!sseClients[id]) {
      sseClients[id] = new Set();
    }
    sseClients[id].add(res);

    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId: id, status: 'connected' })}\n\n`);

    const interval = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(interval);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(interval);
      sseClients[id]?.delete(res);
      if (sseClients[id]?.size === 0) {
        delete sseClients[id];
      }
    });
  });

  // Vite middleware in dev or static files in production
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
