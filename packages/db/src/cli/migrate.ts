import { closeSql } from '../client';
import { migrate, waitForDatabase } from '../migrate';

await waitForDatabase();
await migrate();
await closeSql();
console.log('migrated');
