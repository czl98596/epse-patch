// reset-answers.mjs -- Node.js fallback for tools\reset-answers.ps1
//
// Used only when winsqlite3.dll cannot be loaded through P/Invoke.
// Requires Node.js >= 22.5 (node:sqlite).
//
// Usage: node tools\reset-answers.mjs --db <path-to-sqlite-file> [--archive <dir>]...
//
// Exit codes: 0 ok, 3 database not found, 9 failure.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

const STATEMENTS = [
  'PRAGMA busy_timeout=5000',
  // examinee_question rows are the paper skeleton: reset them, never delete them.
  `UPDATE examinee_question
      SET is_answer = 2,
          answer_result = NULL,
          answer_content = NULL,
          answer_image = NULL,
          answer_result_content = NULL,
          op_process = NULL,
          result_score = NULL,
          check_status = NULL`,
  'DELETE FROM examinee_question_1',
  // 清掉上一轮成绩，避免登录页/结果页残留旧分数
  'UPDATE exam_info SET grade = NULL',
  // examinee_progress is the login credential + exam binding: KEEP the row,
  // only blank the answer traces so the examinee can still log in.
  `UPDATE examinee_progress
      SET answer_time = NULL,
          submit_time = NULL,
          op_process = NULL,
          exam_situation_desc = NULL,
          exam_progress = 1,
          exam_status = 1,
          exam_index = 1`,
  'DELETE FROM exam_lockscreen',
  'DELETE FROM circuit_board_result',
];

function parseArgs(argv) {
  const out = { dbs: [], archives: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--db' && argv[i + 1]) out.dbs.push(argv[++i]);
    else if (argv[i] === '--archive' && argv[i + 1]) out.archives.push(argv[++i]);
  }
  if (out.dbs.length === 0) {
    out.dbs.push(path.resolve(import.meta.dirname, '..', 'epse', 'config', 'electron-service.db'));
  }
  if (out.archives.length === 0) {
    out.archives.push(path.resolve(import.meta.dirname, '..', 'upload', 'exam-answer-archive'));
  }
  return out;
}

function resetDatabase(file) {
  if (!fs.existsSync(file)) {
    console.error(`database not found: ${file}`);
    return 3;
  }
  const db = new DatabaseSync(file);
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const sql of STATEMENTS) {
      try {
        db.exec(sql);
      } catch (err) {
        console.error(`sql skipped (${String(err.message).split('\n')[0]}): ${sql.split('\n')[0]}`);
      }
    }
    db.exec('COMMIT');
    const progress = db.prepare('SELECT count(*) AS n FROM examinee_progress').get().n;
    const answered = db.prepare('SELECT count(*) AS n FROM examinee_question WHERE is_answer = 1').get().n;
    const total = db.prepare('SELECT count(*) AS n FROM examinee_question').get().n;
    console.log(`${path.basename(file)}: exam records kept=${progress}, answered remaining=${answered}, questions=${total}`);
    return 0;
  } catch (err) {
    console.error(`cleanup failed for ${file}: ${err.message}`);
    return 9;
  } finally {
    db.close();
  }
}

function cleanArchives(dirs) {
  for (const dir of dirs) {
    // safety: only ever touch a directory literally named exam-answer-archive
    if (path.basename(dir) !== 'exam-answer-archive') continue;
    if (!fs.existsSync(dir)) continue;
    let count = 0;
    for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) count += 1;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    console.log(`answer archive cleaned: ${dir} (${count} file(s))`);
  }
}

const args = parseArgs(process.argv.slice(2));
let status = 0;
for (const db of args.dbs) {
  const rc = resetDatabase(db);
  if (rc !== 0 && rc !== 3) status = rc;
}
cleanArchives(args.archives);
process.exit(status);
