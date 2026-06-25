import mysql from 'mysql2/promise';

async function testMySQLConnection() {
  try {
    console.log('Attempting to connect to MySQL...');
    console.log('Host: localhost');
    console.log('Port: 3306');
    console.log('User: root');
    console.log('Database: fyp');
    console.log('---');

    const connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '1234',
      database: 'fyp',
    });

    console.log('✅ CONNECTION SUCCESSFUL!');
    
    // Test query to verify database
    const [rows] = await connection.query('SELECT DATABASE() as current_db');
    console.log('Current Database:', rows[0].current_db);
    
    // Check tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('\nTables in fyp database:');
    if (tables.length === 0) {
      console.log('  (No tables found)');
    } else {
      tables.forEach((table) => {
        console.log('  -', Object.values(table)[0]);
      });
    }

    // Check users table
    try {
      const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
      console.log('\nUsers in database:', users[0].count);
    } catch (e) {
      console.log('\nUsers table: Not found or error');
    }

    await connection.end();
    console.log('\n✅ Connection closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ CONNECTION FAILED!');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('\nPossible causes:');
    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('  - MySQL server is not running');
    } else if (error.code === 'ER_ACCESS_DENIED_FOR_USER') {
      console.error('  - Invalid username or password');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('  - Database "fyp" does not exist');
    }
    process.exit(1);
  }
}

testMySQLConnection();
