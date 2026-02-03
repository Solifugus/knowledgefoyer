/**
 * Progress Tracking Utility for Knowledge Foyer Development
 *
 * This utility manages the .development-progress.json file to track
 * implementation progress across all development phases.
 */

const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(__dirname, '../../.development-progress.json');

class ProgressTracker {
  constructor() {
    this.progress = this.loadProgress();
  }

  /**
   * Load progress from file or create default structure
   */
  loadProgress() {
    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
        return JSON.parse(data);
      } else {
        return this.createDefaultProgress();
      }
    } catch (error) {
      console.error('Error loading progress file:', error);
      return this.createDefaultProgress();
    }
  }

  /**
   * Save progress to file
   */
  saveProgress() {
    try {
      this.progress.last_updated = new Date().toISOString();
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(this.progress, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving progress file:', error);
      return false;
    }
  }

  /**
   * Update task completion for current phase
   */
  updateTaskCompletion(phase, completedTasks, totalTasks) {
    if (this.progress.phase_status[phase]) {
      this.progress.phase_status[phase].tasks_completed = completedTasks;
      this.progress.phase_status[phase].tasks_total = totalTasks;
      this.progress.phase_status[phase].completion_percentage =
        Math.round((completedTasks / totalTasks) * 100);
      this.saveProgress();
    }
  }

  /**
   * Mark a phase as completed
   */
  completePhase(phase) {
    if (this.progress.phase_status[phase]) {
      this.progress.phase_status[phase].status = 'completed';
      this.progress.phase_status[phase].completed_at = new Date().toISOString();
      this.progress.phase_status[phase].completion_percentage = 100;
      this.saveProgress();
    }
  }

  /**
   * Start a new phase
   */
  startPhase(phase) {
    if (this.progress.phase_status[phase]) {
      this.progress.current_phase = phase;
      this.progress.phase_status[phase].status = 'in_progress';
      this.progress.phase_status[phase].started_at = new Date().toISOString();
      this.saveProgress();
    }
  }

  /**
   * Update database migration version
   */
  updateMigrationVersion(version) {
    this.progress.database.migration_version = version;
    this.progress.database.last_migration_applied = new Date().toISOString();
    this.saveProgress();
  }

  /**
   * Mark a feature as implemented
   */
  enableFeature(feature) {
    if (this.progress.features.hasOwnProperty(feature)) {
      this.progress.features[feature] = true;
      this.saveProgress();
    }
  }

  /**
   * Update test results
   */
  updateTestResults(passed, failed, coverage = null) {
    this.progress.last_test_run = {
      timestamp: new Date().toISOString(),
      passed,
      failed,
      coverage
    };
    this.saveProgress();
  }

  /**
   * Get current phase status
   */
  getCurrentPhase() {
    return this.progress.current_phase;
  }

  /**
   * Get overall completion percentage
   */
  getOverallCompletion() {
    const phases = Object.keys(this.progress.phase_status);
    const totalPhases = phases.length;
    const completedPhases = phases.filter(
      phase => this.progress.phase_status[phase].status === 'completed'
    ).length;

    return Math.round((completedPhases / totalPhases) * 100);
  }

  /**
   * Generate resume instructions based on current state
   */
  getResumeInstructions() {
    const currentPhase = this.progress.current_phase;
    const phaseStatus = this.progress.phase_status[currentPhase];

    if (phaseStatus.status === 'completed') {
      const nextPhase = this.getNextPhase(currentPhase);
      return `Phase ${currentPhase} completed. Ready to start ${nextPhase}.`;
    } else {
      return `Continue with ${currentPhase} phase. ${phaseStatus.tasks_completed}/${phaseStatus.tasks_total} tasks completed (${phaseStatus.completion_percentage}%).`;
    }
  }

  /**
   * Get the next phase in sequence
   */
  getNextPhase(currentPhase) {
    const phaseOrder = [
      'foundation', 'phase1', 'phase2', 'phase3',
      'phase4', 'phase5', 'phase6', 'phase7',
      'phase8', 'phase9', 'phase10'
    ];

    const currentIndex = phaseOrder.indexOf(currentPhase);
    return currentIndex < phaseOrder.length - 1
      ? phaseOrder[currentIndex + 1]
      : 'all_phases_complete';
  }

  /**
   * Display current progress summary
   */
  displayProgress() {
    console.log('\\n=== Knowledge Foyer Development Progress ===');
    console.log(`Current Phase: ${this.progress.current_phase}`);
    console.log(`Overall Completion: ${this.getOverallCompletion()}%`);
    console.log(`Database Migration: ${this.progress.database.migration_version}`);
    console.log('\\nPhase Status:');

    Object.entries(this.progress.phase_status).forEach(([phase, status]) => {
      const statusIcon = status.status === 'completed' ? '✅'
                       : status.status === 'in_progress' ? '🔄'
                       : '⏳';
      console.log(`  ${statusIcon} ${phase}: ${status.completion_percentage}%`);
    });

    console.log('\\nFeatures Implemented:');
    Object.entries(this.progress.features).forEach(([feature, enabled]) => {
      console.log(`  ${enabled ? '✅' : '❌'} ${feature}`);
    });

    console.log(`\\nResume: ${this.getResumeInstructions()}`);
    console.log('==========================================\\n');
  }

  /**
   * Create default progress structure
   */
  createDefaultProgress() {
    return {
      project_name: "Knowledge Foyer",
      current_phase: "foundation",
      phase_status: {
        foundation: { status: "pending", started_at: null, tasks_completed: 0, tasks_total: 5, completion_percentage: 0 },
        phase1: { status: "pending", started_at: null, tasks_completed: 0, tasks_total: 8, completion_percentage: 0 },
        phase2: { status: "pending", started_at: null, tasks_completed: 0, tasks_total: 6, completion_percentage: 0 },
        phase3: { status: "pending", started_at: null, tasks_completed: 0, tasks_total: 4, completion_percentage: 0 },
        phase4: { status: "pending", started_at: null, tasks_completed: 0, tasks_total: 5, completion_percentage: 0 },
        phase5: { status: "pending", started_at: null, tasks_completed: 0, tasks_total: 4, completion_percentage: 0 },
        phase6: { status: "pending", started_at: null, tasks_completed: 0, tasks_total: 6, completion_percentage: 0 }
      },
      database: { migration_version: "000", last_migration_applied: null, connection_tested: false },
      features: {
        authentication: false, mcp_server: false, feedback_system: false,
        version_control: false, social_features: false, ai_integration: false, production_ready: false
      },
      last_test_run: { timestamp: null, passed: null, failed: null, coverage: null },
      deployment: {
        development_setup_complete: false, production_config_ready: false,
        ssl_configured: false, monitoring_setup: false
      },
      last_updated: new Date().toISOString(),
      resume_instructions: "Starting Foundation Phase"
    };
  }
}

module.exports = ProgressTracker;

// CLI usage
if (require.main === module) {
  const tracker = new ProgressTracker();

  const command = process.argv[2];

  switch (command) {
    case 'show':
      tracker.displayProgress();
      break;

    case 'complete-task':
      const phase = process.argv[3];
      const completed = parseInt(process.argv[4]);
      const total = parseInt(process.argv[5]);
      tracker.updateTaskCompletion(phase, completed, total);
      console.log(`Updated ${phase}: ${completed}/${total} tasks completed`);
      break;

    case 'start-phase':
      const newPhase = process.argv[3];
      tracker.startPhase(newPhase);
      console.log(`Started phase: ${newPhase}`);
      break;

    case 'complete-phase':
      const phaseToComplete = process.argv[3];
      tracker.completePhase(phaseToComplete);
      console.log(`Completed phase: ${phaseToComplete}`);
      break;

    default:
      console.log('Usage:');
      console.log('  node progress.js show');
      console.log('  node progress.js complete-task <phase> <completed> <total>');
      console.log('  node progress.js start-phase <phase>');
      console.log('  node progress.js complete-phase <phase>');
  }
}