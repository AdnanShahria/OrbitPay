package com.orbitsaas.payment.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

data class LocalStats(
    val totalVerifiedVolume: Double,
    val verifiedCount: Int,
    val unclaimedCount: Int,
    val pendingCount: Int
)

@Dao
interface SmsDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertSms(sms: SmsEntity): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertBatch(smsList: List<SmsEntity>): List<Long>

    @Query("SELECT * FROM local_sms WHERE status = 'PENDING_UPLOAD' ORDER BY receivedAt ASC")
    suspend fun getPendingUploads(): List<SmsEntity>

    @Query("SELECT COUNT(*) FROM local_sms WHERE status = 'PENDING_UPLOAD'")
    suspend fun getPendingUploadCount(): Int

    @Query("SELECT COUNT(*) FROM local_sms WHERE status = 'PENDING_UPLOAD'")
    fun getPendingUploadCountFlow(): Flow<Int>

    @Query("UPDATE local_sms SET status = 'UPLOADED', syncedAt = :syncedAt WHERE id IN (:ids)")
    suspend fun markUploaded(ids: List<Long>, syncedAt: Long = System.currentTimeMillis()): Int

    @Query("UPDATE local_sms SET status = 'VERIFIED', externalOrderId = :externalOrderId, syncedAt = :verifiedAt WHERE trxId = :trxId")
    suspend fun markVerifiedByTrxId(
        trxId: String,
        externalOrderId: String,
        verifiedAt: Long = System.currentTimeMillis()
    ): Int

    @Query("SELECT * FROM local_sms ORDER BY receivedAt DESC LIMIT :limit")
    fun getRecentTransactions(limit: Int = 50): Flow<List<SmsEntity>>

    @Query("SELECT * FROM local_sms ORDER BY receivedAt DESC")
    fun getAllTransactionsFlow(): Flow<List<SmsEntity>>

    @Query("SELECT * FROM local_sms WHERE trxId = :trxId LIMIT 1")
    suspend fun findByTrxId(trxId: String): SmsEntity?

    @Query("SELECT COALESCE(SUM(amount), 0.0) FROM local_sms WHERE status = 'VERIFIED'")
    fun getTotalVerifiedVolumeFlow(): Flow<Double>

    @Query("SELECT COUNT(*) FROM local_sms WHERE status = 'VERIFIED'")
    fun getVerifiedCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM local_sms WHERE status != 'VERIFIED'")
    fun getUnclaimedCountFlow(): Flow<Int>

    @Transaction
    @Query("""
        SELECT 
            (SELECT COALESCE(SUM(amount), 0.0) FROM local_sms WHERE status = 'VERIFIED') AS totalVerifiedVolume,
            (SELECT COUNT(*) FROM local_sms WHERE status = 'VERIFIED') AS verifiedCount,
            (SELECT COUNT(*) FROM local_sms WHERE status = 'UPLOADED') AS unclaimedCount,
            (SELECT COUNT(*) FROM local_sms WHERE status = 'PENDING_UPLOAD') AS pendingCount
    """)
    fun getStatsSummaryFlow(): Flow<LocalStats>

    @Query("DELETE FROM local_sms WHERE receivedAt < :beforeTimestamp AND status = 'VERIFIED'")
    suspend fun pruneOldVerified(beforeTimestamp: Long): Int

    @Query("DELETE FROM local_sms")
    suspend fun clearAll()
}
