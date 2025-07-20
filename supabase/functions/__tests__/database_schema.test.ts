import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// Test suite for enhanced database schema
Deno.test('Database Schema - Enhanced Features', async (t) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || 'http://localhost:54321',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test-key'
  )

  await t.step('Test games table with search_text column', async () => {
    // Insert test game
    const { data: game, error: insertError } = await supabase
      .from('games')
      .insert({
        rawg_id: 99999,
        title: 'Test Action Adventure Game',
        genres: ['Action', 'Adventure'],
        platforms: ['PC', 'PlayStation 5'],
        short_description: 'An exciting action-adventure game with stunning visuals',
        price_usd: 59.99,
        critic_score: 85
      })
      .select()
      .single()

    assertEquals(insertError, null)
    assertExists(game)

    // Test that search_text is automatically generated
    const { data: searchResult, error: searchError } = await supabase
      .rpc('search_games_fulltext', { search_query: 'action adventure' })

    assertEquals(searchError, null)
    assertExists(searchResult)

    // Clean up
    await supabase.from('games').delete().eq('rawg_id', 99999)
  })

  await t.step('Test price_history table', async () => {
    // First create a test game
    const { data: game } = await supabase
      .from('games')
      .insert({
        rawg_id: 99998,
        title: 'Price Test Game',
        price_usd: 49.99
      })
      .select()
      .single()

    // Insert price history
    const { data: priceHistory, error: priceError } = await supabase
      .from('price_history')
      .insert({
        game_id: game.id,
        store: 'steam',
        price_usd: 49.99
      })
      .select()
      .single()

    assertEquals(priceError, null)
    assertExists(priceHistory)

    // Test price history query
    const { data: priceData, error: queryError } = await supabase
      .from('price_history')
      .select('*')
      .eq('game_id', game.id)

    assertEquals(queryError, null)
    assertEquals(priceData?.length, 1)

    // Clean up
    await supabase.from('games').delete().eq('id', game.id)
  })

  await t.step('Test conversation tracking tables', async () => {
    // Create conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        session_id: 'test-session-schema'
      })
      .select()
      .single()

    assertEquals(convError, null)
    assertExists(conversation)

    // Add messages
    const { data: message1, error: msg1Error } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversation.id,
        role: 'user',
        content: 'Hello, I need game recommendations'
      })
      .select()
      .single()

    assertEquals(msg1Error, null)
    assertExists(message1)

    const { data: message2, error: msg2Error } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversation.id,
        role: 'assistant',
        content: 'I can help you find great games!',
        metadata: { response_time_ms: 1200 }
      })
      .select()
      .single()

    assertEquals(msg2Error, null)
    assertExists(message2)

    // Test conversation summary view
    const { data: summary, error: summaryError } = await supabase
      .from('conversation_summaries')
      .select('*')
      .eq('session_id', 'test-session-schema')
      .single()

    assertEquals(summaryError, null)
    assertEquals(summary?.message_count, 2)

    // Clean up
    await supabase.from('conversations').delete().eq('id', conversation.id)
  })

  await t.step('Test database indexes exist', async () => {
    // Query to check if indexes exist
    const { data: indexes, error } = await supabase
      .rpc('get_table_indexes', { table_name: 'games' })

    assertEquals(error, null)
    assertExists(indexes)
    
    // Should have indexes for search_text, release_date, price_usd, etc.
    const indexNames = indexes.map((idx: any) => idx.indexname)
    assertEquals(indexNames.includes('games_search_text_idx'), true)
  })

  await t.step('Test constraint validations', async () => {
    // Test invalid role in conversation_messages
    const { error: roleError } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: '00000000-0000-0000-0000-000000000000',
        role: 'invalid_role',
        content: 'test'
      })

    assertExists(roleError) // Should fail due to CHECK constraint

    // Test invalid store in price_history
    const { error: storeError } = await supabase
      .from('price_history')
      .insert({
        game_id: '00000000-0000-0000-0000-000000000000',
        store: 'invalid_store',
        price_usd: 10.00
      })

    assertExists(storeError) // Should fail due to CHECK constraint
  })
})

// Helper function to create RPC for full-text search
Deno.test('Database Schema - Create helper functions', async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || 'http://localhost:54321',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test-key'
  )

  // Create RPC function for full-text search testing
  const createSearchFunction = `
    CREATE OR REPLACE FUNCTION search_games_fulltext(search_query text)
    RETURNS TABLE(id uuid, title text, rank real) AS $
    BEGIN
      RETURN QUERY
      SELECT g.id, g.title, ts_rank(g.search_text, to_tsquery('english', search_query)) as rank
      FROM games g
      WHERE g.search_text @@ to_tsquery('english', search_query)
      ORDER BY rank DESC;
    END;
    $ LANGUAGE plpgsql;
  `

  const createIndexFunction = `
    CREATE OR REPLACE FUNCTION get_table_indexes(table_name text)
    RETURNS TABLE(indexname text, indexdef text) AS $
    BEGIN
      RETURN QUERY
      SELECT i.indexname::text, i.indexdef::text
      FROM pg_indexes i
      WHERE i.tablename = table_name;
    END;
    $ LANGUAGE plpgsql;
  `

  // Execute the functions (these would normally be in migrations)
  await supabase.rpc('exec_sql', { sql: createSearchFunction })
  await supabase.rpc('exec_sql', { sql: createIndexFunction })
})