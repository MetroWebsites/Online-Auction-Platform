// Database helper utilities

export interface DBResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export async function executeQuery<T = any>(
  db: D1Database,
  query: string,
  params: any[] = []
): Promise<DBResult<T[]>> {
  try {
    const stmt = db.prepare(query).bind(...params)
    const result = await stmt.all()
    
    return {
      success: result.success,
      data: result.results as T[]
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
}

export async function executeQueryOne<T = any>(
  db: D1Database,
  query: string,
  params: any[] = []
): Promise<DBResult<T>> {
  try {
    const stmt = db.prepare(query).bind(...params)
    const result = await stmt.first()
    
    return {
      success: true,
      data: result as T
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
}

export async function executeUpdate(
  db: D1Database,
  query: string,
  params: any[] = []
): Promise<DBResult<{ changes: number; lastRowId: number }>> {
  try {
    const stmt = db.prepare(query).bind(...params)
    const result = await stmt.run()
    
    return {
      success: result.success,
      data: {
        changes: result.meta.changes,
        lastRowId: result.meta.last_row_id
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
}

// Transaction helper (D1 doesn't support transactions directly, but we can batch)
export async function executeBatch(
  db: D1Database,
  statements: { query: string; params: any[] }[]
): Promise<DBResult<any[]>> {
  try {
    const batch = statements.map(({ query, params }) => 
      db.prepare(query).bind(...params)
    )
    
    const results = await db.batch(batch)
    
    return {
      success: true,
      data: results
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
}

// Pagination helper
export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function buildPaginationQuery(
  baseQuery: string,
  params: PaginationParams,
  countQuery?: string
): { query: string; countQuery: string; limit: number; offset: number } {
  const page = Math.max(1, params.page || 1)
  const limit = Math.min(100, Math.max(1, params.limit || 20))
  const offset = (page - 1) * limit
  
  let query = baseQuery
  
  if (params.sortBy) {
    query += ` ORDER BY ${params.sortBy} ${params.sortOrder || 'ASC'}`
  }
  
  query += ` LIMIT ${limit} OFFSET ${offset}`
  
  const finalCountQuery = countQuery || baseQuery.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) as total FROM')
  
  return {
    query,
    countQuery: finalCountQuery,
    limit,
    offset
  }
}
