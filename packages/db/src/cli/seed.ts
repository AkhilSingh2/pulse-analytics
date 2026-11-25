import { closeSql } from '../client';
import { migrate, waitForDatabase } from '../migrate';
import { seed } from '../seed';

await waitForDatabase();
await migrate();
await seed();
await closeSql();
