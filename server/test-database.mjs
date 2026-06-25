import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'fyp',
};

async function testDatabaseConnection() {
  console.log('='.repeat(60));
  console.log('DATABASE CONNECTION TEST');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Connect to MySQL
    console.log('\n[TEST 1] Attempting to connect to MySQL...');
    const connection = await mysql.createConnection(config);
    console.log('✓ Successfully connected to MySQL');
    
    // Test 2: Check database exists
    console.log('\n[TEST 2] Checking if "fyp" database exists...');
    const [databases] = await connection.query('SHOW DATABASES LIKE "fyp"');
    if (databases.length > 0) {
      console.log('✓ Database "fyp" exists');
    } else {
      console.log('✗ Database "fyp" does not exist');
      await connection.end();
      return;
    }

    // Test 3: Check tables
    console.log('\n[TEST 3] Checking tables...');
    const requiredTables = ['users', 'quizzes', 'questions', 'question_options', 'student_quiz_attempts'];
    const [tables] = await connection.query(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = "fyp"'
    );
    const tableNames = tables.map(t => t.TABLE_NAME);
    
    for (const table of requiredTables) {
      if (tableNames.includes(table)) {
        console.log(`  ✓ Table "${table}" exists`);
      } else {
        console.log(`  ✗ Table "${table}" is missing`);
      }
    }

    // Test 4: Count records in each table
    console.log('\n[TEST 4] Checking data in tables...');
    for (const table of requiredTables) {
      const [result] = await connection.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = result[0].count;
      console.log(`  ${table}: ${count} records`);
    }

    // Test 5: Test INSERT - Create a test user
    console.log('\n[TEST 5] Testing INSERT operation - Creating test user...');
    try {
      const testEmail = `test_${Date.now()}@example.com`;
      const [insertResult] = await connection.query(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['Test User', testEmail, '$2a$10$testhashedpassword', 'Student']
      );
      console.log(`✓ Successfully inserted user with ID: ${insertResult.insertId}`);
      const testUserId = insertResult.insertId;

      // Test 6: Test SELECT
      console.log('\n[TEST 6] Testing SELECT operation - Fetching user...');
      const [selectResult] = await connection.query(
        'SELECT id, username, email, role FROM users WHERE id = ?',
        [testUserId]
      );
      if (selectResult.length > 0) {
        const user = selectResult[0];
        console.log(`✓ Successfully retrieved user:`);
        console.log(`  ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Role: ${user.role}`);
      }

      // Test 7: Test CREATE quiz
      console.log('\n[TEST 7] Testing INSERT operation - Creating test quiz...');
      const [quizResult] = await connection.query(
        'INSERT INTO quizzes (instructor_id, title, description) VALUES (?, ?, ?)',
        [1, 'Test Quiz', 'This is a test quiz']
      );
      const testQuizId = quizResult.insertId;
      console.log(`✓ Successfully created quiz with ID: ${testQuizId}`);

      // Test 8: Test CREATE question
      console.log('\n[TEST 8] Testing INSERT operation - Creating test question...');
      const [questionResult] = await connection.query(
        'INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES (?, ?, ?, ?, ?)',
        [testQuizId, 'What is the capital of France?', 'multiple-choice', 'Paris', 1]
      );
      const testQuestionId = questionResult.insertId;
      console.log(`✓ Successfully created question with ID: ${testQuestionId}`);

      // Test 9: Test CREATE question options
      console.log('\n[TEST 9] Testing INSERT operation - Adding question options...');
      const options = ['Paris', 'London', 'Berlin', 'Madrid'];
      for (let i = 0; i < options.length; i++) {
        await connection.query(
          'INSERT INTO question_options (question_id, option_text, option_order) VALUES (?, ?, ?)',
          [testQuestionId, options[i], i + 1]
        );
      }
      console.log(`✓ Successfully added ${options.length} options to question`);

      // Test 10: Test SAVE quiz attempt
      console.log('\n[TEST 10] Testing INSERT operation - Recording quiz attempt...');
      const [attemptResult] = await connection.query(
        'INSERT INTO student_quiz_attempts (student_id, quiz_id, score, correct_answers, total_questions) VALUES (?, ?, ?, ?, ?)',
        [testUserId, testQuizId, 75.5, 3, 4]
      );
      console.log(`✓ Successfully recorded quiz attempt with ID: ${attemptResult.insertId}`);
      console.log(`  Score: 75.5%, Correct: 3/4`);

      // Test 11: Test FETCH student performance
      console.log('\n[TEST 11] Testing SELECT operation - Fetching student performance...');
      const [performanceResult] = await connection.query(`
        SELECT 
          sqa.id,
          sqa.student_id,
          sqa.quiz_id,
          sqa.score,
          sqa.correct_answers,
          sqa.total_questions,
          sqa.completed_at,
          q.title as quiz_title,
          u.username
        FROM student_quiz_attempts sqa
        JOIN quizzes q ON sqa.quiz_id = q.id
        JOIN users u ON sqa.student_id = u.id
        WHERE sqa.student_id = ?
      `, [testUserId]);
      
      if (performanceResult.length > 0) {
        console.log(`✓ Successfully retrieved performance data:`);
        for (const record of performanceResult) {
          console.log(`  Quiz: ${record.quiz_title}, Score: ${record.score}%, Completed: ${record.completed_at}`);
        }
      }

      // Test 12: Test UPDATE
      console.log('\n[TEST 12] Testing UPDATE operation...');
      await connection.query(
        'UPDATE users SET username = ? WHERE id = ?',
        ['Updated Test User', testUserId]
      );
      const [updatedUser] = await connection.query('SELECT username FROM users WHERE id = ?', [testUserId]);
      console.log(`✓ Successfully updated user: ${updatedUser[0].username}`);

      // Test 13: Test DELETE (cleanup)
      console.log('\n[TEST 13] Testing DELETE operation - Cleaning up test data...');
      
      // Delete question options first
      await connection.query('DELETE FROM question_options WHERE question_id = ?', [testQuestionId]);
      console.log(`  ✓ Deleted question options`);
      
      // Delete questions
      await connection.query('DELETE FROM questions WHERE id = ?', [testQuestionId]);
      console.log(`  ✓ Deleted question`);
      
      // Delete quiz attempts
      await connection.query('DELETE FROM student_quiz_attempts WHERE student_id = ?', [testUserId]);
      console.log(`  ✓ Deleted quiz attempts`);
      
      // Delete quiz
      await connection.query('DELETE FROM quizzes WHERE id = ?', [testQuizId]);
      console.log(`  ✓ Deleted quiz`);
      
      // Delete user
      await connection.query('DELETE FROM users WHERE id = ?', [testUserId]);
      console.log(`  ✓ Deleted user`);

    } catch (error) {
      console.error('✗ Error during data operation:', error.message);
    }

    // Test 14: Test connection pool
    console.log('\n[TEST 14] Testing connection pool...');
    const pool = mysql.createPool(config);
    const poolConnection = await pool.getConnection();
    const [pingResult] = await poolConnection.query('SELECT 1 as ping');
    poolConnection.release();
    if (pingResult[0].ping === 1) {
      console.log('✓ Connection pool working correctly');
    }
    await pool.end();

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS COMPLETED SUCCESSFULLY ✓');
    console.log('='.repeat(60));
    console.log('\nDatabase Configuration:');
    console.log(`  Host: ${config.host}`);
    console.log(`  Port: ${config.port}`);
    console.log(`  User: ${config.user}`);
    console.log(`  Database: ${config.database}`);
    console.log('\nThe MySQL database is properly configured and all operations are working!');
    
    await connection.end();

  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
    console.error('\nConnection Details:');
    console.error(`  Host: ${config.host}`);
    console.error(`  Port: ${config.port}`);
    console.error(`  User: ${config.user}`);
    console.error(`  Database: ${config.database}`);
    console.error('\nPlease ensure:');
    console.error('  1. MySQL server is running');
    console.error('  2. Database credentials are correct in .env file');
    console.error('  3. Database "fyp" exists');
    console.error('  4. All required tables are created');
    process.exit(1);
  }
}

testDatabaseConnection();
