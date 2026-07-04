"""Initial schema definition including indexes and relationships.

Revision ID: 001
Revises: None
Create Date: 2026-07-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # 1. Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_username', 'users', ['username'], unique=True)

    # 2. Organizations table
    op.create_table(
        'organizations',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_organizations_id', 'organizations', ['id'])
    op.create_index('ix_organizations_name', 'organizations', ['name'], unique=True)

    # 3. Organization Members association table
    op.create_table(
        'organization_members',
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('role', sa.String(), nullable=True)
    )

    # 4. Projects table
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_projects_id', 'projects', ['id'])

    # 5. Retry Policies table
    op.create_table(
        'retry_policies',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('strategy', sa.String(), nullable=False),
        sa.Column('backoff_factor', sa.Integer(), nullable=False),
        sa.Column('backoff_max_delay', sa.Integer(), nullable=False),
        sa.Column('max_retries', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_retry_policies_id', 'retry_policies', ['id'])

    # 6. Queues table
    op.create_table(
        'queues',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('priority', sa.String(), nullable=True),
        sa.Column('concurrency_limit', sa.Integer(), nullable=True),
        sa.Column('is_paused', sa.Boolean(), nullable=True),
        sa.Column('retry_policy_id', sa.Integer(), sa.ForeignKey('retry_policies.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_queues_id', 'queues', ['id'])
    op.create_index('ix_queues_name', 'queues', ['name'], unique=True)

    # 7. Batches table
    op.create_table(
        'batches',
        sa.Column('id', sa.String(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('total_jobs', sa.Integer(), nullable=True),
        sa.Column('completed_count', sa.Integer(), nullable=True),
        sa.Column('failed_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_batches_id', 'batches', ['id'])

    # 8. Cron Schedules table
    op.create_table(
        'cron_schedules',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('cron_expression', sa.String(), nullable=False),
        sa.Column('queue_id', sa.Integer(), sa.ForeignKey('queues.id', ondelete='CASCADE'), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=True),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('next_run_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_cron_schedules_id', 'cron_schedules', ['id'])

    # 9. Workers table
    op.create_table(
        'workers',
        sa.Column('id', sa.String(), nullable=False, primary_key=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('last_heartbeat', sa.DateTime(), nullable=True),
        sa.Column('metadata_info', sa.JSON(), nullable=True)
    )
    op.create_index('ix_workers_id', 'workers', ['id'])
    op.create_index('ix_workers_last_heartbeat', 'workers', ['last_heartbeat'])

    # 10. Jobs table
    op.create_table(
        'jobs',
        sa.Column('id', sa.String(), nullable=False, primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('queue_id', sa.Integer(), sa.ForeignKey('queues.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('worker_id', sa.String(), sa.ForeignKey('workers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('batch_id', sa.String(), sa.ForeignKey('batches.id', ondelete='CASCADE'), nullable=True),
        sa.Column('cron_schedule_id', sa.Integer(), sa.ForeignKey('cron_schedules.id', ondelete='SET NULL'), nullable=True),
        sa.Column('scheduled_at', sa.DateTime(), nullable=True),
        sa.Column('claimed_at', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_jobs_id', 'jobs', ['id'])
    op.create_index('ix_jobs_status', 'jobs', ['status'])
    op.create_index('ix_jobs_scheduled_at', 'jobs', ['scheduled_at'])
    op.create_index('ix_jobs_worker_id', 'jobs', ['worker_id'])
    
    # Composite indexes for jobs query performance
    op.create_index('idx_jobs_queue_status', 'jobs', ['queue_id', 'status'])
    op.create_index('idx_jobs_status_scheduled', 'jobs', ['status', 'scheduled_at'])
    op.create_index('idx_jobs_queue_priority_created', 'jobs', ['queue_id', 'priority', 'created_at'])

    # 11. Job Executions table
    op.create_table(
        'job_executions',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('job_id', sa.String(), sa.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('worker_id', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True)
    )
    op.create_index('ix_job_executions_id', 'job_executions', ['id'])
    op.create_index('ix_job_executions_job_id', 'job_executions', ['job_id'])

    # 12. Job Logs table
    op.create_table(
        'job_logs',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('job_id', sa.String(), sa.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('execution_id', sa.Integer(), sa.ForeignKey('job_executions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.Column('level', sa.String(), nullable=True),
        sa.Column('message', sa.Text(), nullable=False)
    )
    op.create_index('ix_job_logs_id', 'job_logs', ['id'])
    op.create_index('ix_job_logs_job_id', 'job_logs', ['job_id'])

    # 13. Worker Heartbeats table
    op.create_table(
        'worker_heartbeats',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('worker_id', sa.String(), sa.ForeignKey('workers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('metadata_info', sa.JSON(), nullable=True)
    )
    op.create_index('ix_worker_heartbeats_id', 'worker_heartbeats', ['id'])
    op.create_index('ix_worker_heartbeats_worker_id', 'worker_heartbeats', ['worker_id'])
    op.create_index('ix_worker_heartbeats_timestamp', 'worker_heartbeats', ['timestamp'])

    # 14. Dead Letter Jobs table
    op.create_table(
        'dead_letter_jobs',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('job_id', sa.String(), sa.ForeignKey('jobs.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('queue_id', sa.Integer(), sa.ForeignKey('queues.id', ondelete='CASCADE'), nullable=False),
        sa.Column('failed_at', sa.DateTime(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('failure_summary', sa.Text(), nullable=True),
        sa.Column('failure_category', sa.String(), nullable=True)
    )
    op.create_index('ix_dead_letter_jobs_id', 'dead_letter_jobs', ['id'])
    op.create_index('ix_dead_letter_jobs_job_id', 'dead_letter_jobs', ['job_id'])

    # 15. Audit Logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.Column('details', sa.String(), nullable=True)
    )
    op.create_index('ix_audit_logs_id', 'audit_logs', ['id'])

def downgrade():
    op.drop_table('audit_logs')
    op.drop_table('dead_letter_jobs')
    op.drop_table('worker_heartbeats')
    op.drop_table('job_logs')
    op.drop_table('job_executions')
    op.drop_table('jobs')
    op.drop_table('workers')
    op.drop_table('cron_schedules')
    op.drop_table('batches')
    op.drop_table('queues')
    op.drop_table('retry_policies')
    op.drop_table('projects')
    op.drop_table('organization_members')
    op.drop_table('organizations')
    op.drop_table('users')
