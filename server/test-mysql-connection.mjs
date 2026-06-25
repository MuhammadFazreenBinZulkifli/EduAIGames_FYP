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
    console.log('Current Database:', (rows as any[])[0].current_db);
    
    // Check tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('\nTables in fyp database:');
    if ((tables as any[]).length === 0) {
      console.log('  (No tables found)');
    } else {
      (tables as any[]).forEach((table: any) => {
        console.log('  -', Object.values(table)[0]);
      });
    }

    await connection.end();
    console.log('\n✅ Connection closed successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ CONNECTION FAILED!');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    process.exit(1);
  }
}

testMySQLConnection();
