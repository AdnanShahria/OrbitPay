package com.orbitsaas.payment.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface BlockedMessageDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(msg: BlockedMessageEntity): Long

    @Query("SELECT * FROM blocked_messages ORDER BY receivedAt DESC LIMIT :limit")
    fun recent(limit: Int = 100): Flow<List<BlockedMessageEntity>>

    @Query("SELECT COUNT(*) FROM blocked_messages")
    fun countFlow(): Flow<Int>

    @Query("DELETE FROM blocked_messages WHERE receivedAt < :ts")
    suspend fun pruneOlderThan(ts: Long): Int
}
