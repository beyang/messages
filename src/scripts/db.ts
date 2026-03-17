import { getDatabasePath, initializeDatabase } from '../server/db';
import { resetAllData, seedDummyData } from '../server/store';

function printUsage(): void {
  console.log('Usage: pnpm db:seed | pnpm db:reset');
}

function main(): void {
  initializeDatabase();

  const command = process.argv[2];
  switch (command) {
    case 'seed': {
      seedDummyData();
      console.log(`Seeded database at ${getDatabasePath()}`);
      return;
    }
    case 'reset': {
      resetAllData();
      console.log(`Reset database at ${getDatabasePath()}`);
      return;
    }
    default: {
      printUsage();
      process.exitCode = 1;
    }
  }
}

main();
