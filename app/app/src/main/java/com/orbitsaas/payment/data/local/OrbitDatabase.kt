package com.orbitsaas.payment.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [SmsEntity::class, BlockedMessageEntity::class],
    version = 2,
    exportSchema = false
)
abstract class OrbitDatabase : RoomDatabase() {

    abstract fun smsDao(): SmsDao
    abstract fun blockedMessageDao(): BlockedMessageDao

    companion object {
        @Volatile
        private var INSTANCE: OrbitDatabase? = null

        private const val DATABASE_NAME = "orbit_payment_db"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `local_sms` ADD COLUMN `smsSender` TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE `local_sms` ADD COLUMN `source` TEXT NOT NULL DEFAULT 'SMS'")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `blocked_messages` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        `sender` TEXT NOT NULL,
                        `body` TEXT NOT NULL,
                        `reason` TEXT NOT NULL,
                        `source` TEXT NOT NULL DEFAULT 'SMS',
                        `receivedAt` INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_blocked_messages_receivedAt` ON `blocked_messages` (`receivedAt`)"
                )
            }
        }

        fun getDatabase(context: Context): OrbitDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    OrbitDatabase::class.java,
                    DATABASE_NAME
                )
                    .addMigrations(MIGRATION_1_2)
                    .fallbackToDestructiveMigrationOnDowngrade()
                    .addCallback(object : Callback() {
                        override fun onCreate(db: SupportSQLiteDatabase) {
                            super.onCreate(db)
                        }
                    })
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
