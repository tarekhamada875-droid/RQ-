const GARAGE_DELETE_PAGE_SIZE = 400;

async function deleteQueryInPages(adminDb: any, query: any): Promise<number> {
  let deleted = 0;
  while (true) {
    const page = await query.limit(GARAGE_DELETE_PAGE_SIZE).get();
    if (page.empty) break;

    const batch = adminDb.batch();
    page.docs.forEach((docSnap: any) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += page.docs.length;

    if (page.docs.length < GARAGE_DELETE_PAGE_SIZE) break;
  }
  return deleted;
}

/**
 * Deletes only records owned by a garage, matching the existing Express route's
 * cleanup contract. Each batch stays below Firestore's 500-write limit, and all
 * queries are scoped to the garage ID (and entity type where IDs may overlap).
 */
export async function deleteGarageOwnedData(adminDb: any, garageId: string): Promise<number> {
  let deleted = 0;

  for (const subcollection of ['vehicles', 'subscribers', 'daily_counts', 'daily_stats', 'events', 'projection_buckets']) {
    deleted += await deleteQueryInPages(adminDb, adminDb.collection(`garages/${garageId}/${subcollection}`));
  }

  const topLevelQueries = [
    adminDb.collection('activity_logs').where('garageId', '==', garageId),
    adminDb.collection('recharge_requests').where('garageId', '==', garageId),
    adminDb.collection('staff').where('garageId', '==', garageId),
    adminDb.collection('garage_sessions').where('entityId', '==', garageId),
    adminDb.collection('private_pins').where('entityId', '==', garageId).where('entityType', '==', 'garages'),
    adminDb.collection('pin_reservations').where('entityId', '==', garageId).where('entityType', '==', 'garages')
  ];

  for (const query of topLevelQueries) {
    deleted += await deleteQueryInPages(adminDb, query);
  }

  return deleted;
}
