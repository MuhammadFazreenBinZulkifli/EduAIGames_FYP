# PostgreSQL Migration Guide

## Overview
Your application has been successfully migrated from MySQL to PostgreSQL. All table names, data structure, and functionality remain unchanged.

## Changes Made

### 1. **Database Driver Migration**
- **MySQL**: mysql2/promise
- **PostgreSQL**: pg

### 2. **Updated Files**
- ✅ `server/src/db.ts` - Connection pool configuration
- ✅ `server/src/setupDatabase.ts` - Database and table creation
- ✅ `server/src/queries.ts` - User-related database queries
- ✅ `server/src/quizQueries.ts` - Quiz-related database queries
- ✅ `server/package.json` - Dependencies (mysql2 → pg)
- ✅ `POSTGRESQL_SETUP.sql` - Complete SQL schema and sample data

### 3. **Key Syntax Conversions**
| MySQL | PostgreSQL |
|-------|-----------|
| `INT AUTO_INCREMENT` | `SERIAL` |
| `?` (placeholders) | `$1, $2, $3` (numbered placeholders) |
| `ENUM('val1', 'val2')` | `ENUM type` |
| `pool.getConnection()` | `pool.connect()` |
| `[rows]` destructuring | `.rows` property |
| `START TRANSACTION` | `BEGIN` |
| `INSERT IGNORE` | `ON CONFLICT DO NOTHING` |
| `ERROR_CODE: ER_DUP_ENTRY` | `ERROR_CODE: 23505` |

## Setup Instructions

### Step 1: Install PostgreSQL
```bash
# Windows (using chocolatey)
choco install postgresql

# macOS (using brew)
brew install postgresql

# Linux
sudo apt-get install postgresql postgresql-contrib
```

### Step 2: Create PostgreSQL Database
```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create the database
CREATE DATABASE fyp;

# Exit psql
\q
```

### Step 3: Run the SQL Setup Script
```bash
# Run the provided SQL script
psql -U postgres -d fyp -f POSTGRESQL_SETUP.sql
```

### Step 4: Update Environment Variables
Update your `.env` file:
```env
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fyp
DB_USER=postgres
DB_PASSWORD=your_postgres_password
```

### Step 5: Install Dependencies
```bash
cd server
npm install
```

### Step 6: Build and Start the Server
```bash
# Build TypeScript
npm run build

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

## Database Structure

### Tables
1. **users** - User accounts (Instructor/Student roles)
2. **quizzes** - Quiz definitions
3. **questions** - Quiz questions
4. **question_options** - Multiple choice options
5. **student_quiz_attempts** - Student quiz grades and attempts

### Indexes
- `idx_users_email` - Email lookup optimization
- `idx_users_role` - Role-based queries
- `idx_quizzes_instructor` - Instructor's quizzes lookup
- `idx_questions_quiz` - Questions by quiz
- `idx_options_question` - Options by question
- `idx_attempts_student` - Student's attempts lookup
- `idx_attempts_quiz` - Quiz attempts lookup

## Sample Data
Default users are created during setup:
- **Instructor**: instructor@example.com / password123
- **Student**: student@example.com / password123

## Verification
After setup, verify the database:
```bash
# Connect to PostgreSQL
psql -U postgres -d fyp

# List tables
\dt

# Check table structure
\d users
\d quizzes
\d questions
\d question_options
\d student_quiz_attempts

# View sample data
SELECT * FROM users;
```

## Notes
- All table names remain unchanged
- All data types are preserved
- All relationships (foreign keys) are maintained
- All constraints and indexes are optimized for PostgreSQL
- The application code handles the query syntax differences

## Troubleshooting

### Connection Issues
```bash
# Test PostgreSQL connection
psql -h localhost -U postgres -d fyp
```

### Permission Errors
```bash
# Grant privileges to your user
psql -U postgres -d fyp
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
```

### Reset Database
```bash
# Drop and recreate the database
psql -U postgres -c "DROP DATABASE IF EXISTS fyp;"
psql -U postgres -f POSTGRESQL_SETUP.sql
```

## Additional Resources
- [PostgreSQL Official Documentation](https://www.postgresql.org/docs/)
- [node-postgres (pg) Documentation](https://node-postgres.com/)
- [PostgreSQL vs MySQL Differences](https://www.postgresql.org/docs/current/sql-syntax.html)
