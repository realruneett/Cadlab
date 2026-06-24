import { createClient } from '@libsql/client';

async function testLibsql() {
  console.log("DATABASE_URL env:", process.env.DATABASE_URL);
  
  try {
    const client = createClient({
      url: 'file:./prisma/dev.db',
    });
    
    console.log("Libsql client created successfully.");
    const rs = await client.execute("SELECT 1");
    console.log("Query success! Result:", rs);
  } catch (err: any) {
    console.error("Libsql test failed:", err.message, err.stack);
  }
}

testLibsql();
