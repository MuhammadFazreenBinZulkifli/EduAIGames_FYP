import pkg from 'pg';
import dotenv from 'dotenv';

const { Client } = pkg;
dotenv.config();
const dbName = process.env.DB_NAME || 'fyp';
const dbPort = parseInt(process.env.DB_PORT || '5432');

if (dbPort === 3306) {
  console.warn('DB_PORT is set to 3306, which is MySQL default. PostgreSQL usually uses 5432.');
}

// Create a connection to PostgreSQL to create the database
async function createDatabase() {
  const adminConnection = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: dbPort,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
  });

  try {
    await adminConnection.connect();
    // Check if database exists
    const result = await adminConnection.query(
      `SELECT FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    if (result.rows.length === 0) {
      await adminConnection.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}";`);
      console.log(`${dbName} database created successfully`);
    } else {
      console.log(`${dbName} database already exists`);
    }
  } finally {
    await adminConnection.end();
  }
}

export async function setupDatabase() {
  try {
    // Step 1: Create the configured database if it doesn't exist
    console.log(`Creating ${dbName} database...`);
    await createDatabase();

    // Step 2: Connect to configured database and create tables
    console.log(`Creating tables in ${dbName} database...`);
    const fypConnection = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: dbPort,
      database: dbName,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '123456',
    });

    try {
      await fypConnection.connect();

      // Create ENUM types
      await fypConnection.query(`
        DO $$ BEGIN
          CREATE TYPE user_role AS ENUM ('Instructor', 'Student', 'Admin');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await fypConnection.query(`
        DO $$ BEGIN
          CREATE TYPE question_type AS ENUM ('multiple-choice', 'true-false');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Create users table
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role user_role NOT NULL,
          account_status VARCHAR(20) NOT NULL DEFAULT 'approved',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create indexes for users table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      `);

      // OTP records for email verification and password reset
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS email_otp_codes (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          purpose VARCHAR(50) NOT NULL,
          otp_hash VARCHAR(255) NOT NULL,
          payload JSONB,
          expires_at TIMESTAMP NOT NULL,
          consumed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_email_otp_lookup
        ON email_otp_codes(email, purpose, consumed, created_at DESC);
      `);

      // Create courses table (owned by instructors)
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS courses (
          id SERIAL PRIMARY KEY,
          instructor_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Create index for courses table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses(instructor_id);
      `);

      // Create student_enrollments table (links students to courses)
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS student_enrollments (
          id SERIAL PRIMARY KEY,
          student_id INT NOT NULL,
          course_id INT NOT NULL,
          enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
          UNIQUE(student_id, course_id)
        );
      `);

      // Create indexes for student_enrollments table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_enrollments_student ON student_enrollments(student_id);
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_enrollments_course ON student_enrollments(course_id);
      `);

      // Create quizzes table
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS quizzes (
          id SERIAL PRIMARY KEY,
          instructor_id INT NOT NULL,
          course_id INT,
          class_id INT,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
        );
      `);

      // Create index for quizzes table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_quizzes_instructor ON quizzes(instructor_id);
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);
      `);

      // Create questions table
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS questions (
          id SERIAL PRIMARY KEY,
          quiz_id INT NOT NULL,
          question_text TEXT NOT NULL,
          question_type question_type NOT NULL,
          correct_answer VARCHAR(255) NOT NULL,
          question_order INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        );
      `);

      // Create index for questions table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
      `);

      // Create question_options table
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS question_options (
          id SERIAL PRIMARY KEY,
          question_id INT NOT NULL,
          option_text VARCHAR(255) NOT NULL,
          option_order INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        );
      `);

      // Create index for question_options table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_options_question ON question_options(question_id);
      `);

      // Create student_quiz_attempts table
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS student_quiz_attempts (
          id SERIAL PRIMARY KEY,
          student_id INT NOT NULL,
          quiz_id INT NOT NULL,
          score DECIMAL(5, 2) NOT NULL,
          correct_answers INT NOT NULL,
          total_questions INT NOT NULL,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        );
      `);

      // Create indexes for student_quiz_attempts table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_attempts_student ON student_quiz_attempts(student_id);
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON student_quiz_attempts(quiz_id);
      `);

      await fypConnection.query(`
        ALTER TABLE student_quiz_attempts ADD COLUMN IF NOT EXISTS responses JSONB;
      `);

      // Create classes table
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS classes (
          id SERIAL PRIMARY KEY,
          instructor_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          join_code VARCHAR(10) UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Create index for classes table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_classes_instructor ON classes(instructor_id);
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_classes_join_code ON classes(join_code);
      `);

      await fypConnection.query(`
        ALTER TABLE classes
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public';
      `);
      await fypConnection.query(`
        DO $$ BEGIN
          ALTER TABLE classes
          ADD CONSTRAINT classes_visibility_check
          CHECK (visibility IN ('public', 'private'));
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_classes_visibility ON classes(visibility);
      `);

      // Keep compatibility with existing databases created before class-based quiz support
      await fypConnection.query(`
        ALTER TABLE quizzes
        ADD COLUMN IF NOT EXISTS class_id INT;
      `);
      await fypConnection.query(`
        DO $$ BEGIN
          ALTER TABLE quizzes
          ADD CONSTRAINT quizzes_class_id_fkey
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_quizzes_class ON quizzes(class_id);
      `);

      // Keep compatibility: add explanation column to questions if missing
      await fypConnection.query(`
        ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT;
      `);

      // Create class_memberships table (links students to classes)
      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS class_memberships (
          id SERIAL PRIMARY KEY,
          student_id INT NOT NULL,
          class_id INT NOT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          UNIQUE(student_id, class_id)
        );
      `);

      // Create indexes for class_memberships table
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_memberships_student ON class_memberships(student_id);
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_memberships_class ON class_memberships(class_id);
      `);

      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS class_topics (
          id SERIAL PRIMARY KEY,
          class_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          is_quiz_topic BOOLEAN NOT NULL DEFAULT false,
          display_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        );
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_class_topics_class ON class_topics(class_id);
      `);

      await fypConnection.query(`
        CREATE TABLE IF NOT EXISTS class_topic_items (
          id SERIAL PRIMARY KEY,
          topic_id INT NOT NULL,
          class_id INT NOT NULL,
          item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('file', 'quiz')),
          title VARCHAR(255) NOT NULL,
          file_name VARCHAR(512),
          stored_name VARCHAR(512),
          mime_type VARCHAR(128),
          quiz_id INT,
          display_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (topic_id) REFERENCES class_topics(id) ON DELETE CASCADE,
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        );
      `);
      await fypConnection.query(`
        CREATE INDEX IF NOT EXISTS idx_class_topic_items_topic ON class_topic_items(topic_id);
      `);

      console.log('Tables created successfully');

      // Step 3: Keep database empty for user-created data only
      console.log('Sample data seeding is disabled. Database is ready for your own data.');
    } finally {
      await fypConnection.end();
    }
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  }
}

// Run setup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase()
    .then(() => {
      console.log('Database setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}
