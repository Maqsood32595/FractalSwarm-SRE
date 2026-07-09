import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function executeTerminalCommand(command: string): Promise<{ success: boolean; output: string; error?: string }> {
  console.log(`[Terminal Executor] Running command: "${command}"`);
  
  // High-level safety guard (local fallback block) to prevent destructive commands
  const lowerCmd = command.toLowerCase();
  const dangerousPatterns = ['rm -rf /', 'mkfs', 'dd if=', 'shutdown', 'reboot', 'killall'];
  for (const pattern of dangerousPatterns) {
    if (lowerCmd.includes(pattern)) {
      return {
        success: false,
        output: '',
        error: `Execution blocked: Dangerous command pattern "${pattern}" detected.`
      };
    }
  }

  let commandToRun = command;
  if (process.platform === 'win32') {
    console.log('[Terminal Executor] Windows host detected. Translating Linux SRE commands to Windows equivalents...');
    if (command.includes('df -h')) {
      commandToRun = command.replace('df -h', 'wmic logicaldisk get caption,size,freespace');
    }
    if (command.includes('fuser -k 5432/tcp')) {
      // Simulate port freeing
      commandToRun = command.replace('fuser -k 5432/tcp', 'echo [Simulating: Killing task holding port 5432]');
    }
    if (command.includes('nginx -s reload')) {
      commandToRun = 'echo "Reloading Nginx..." && echo "[Simulating: Nginx reload completed successfully]"';
    }
    if (command.includes('pg_ctl start')) {
      commandToRun = 'echo "Starting Postgres Server..." && echo "[Simulating: Postgres restarted successfully]"';
    }
    if (command.includes('free -m')) {
      commandToRun = 'echo "Checking system memory..." && echo "[Simulating: Free Memory - 4096MB available]"';
    }
  }

  try {
    const { stdout, stderr } = await execPromise(commandToRun, { timeout: 120000 });
    
    return {
      success: true,
      output: stdout.trim() || stderr.trim() || 'Command completed with no output.'
    };
  } catch (err: any) {
    console.error('[Terminal Executor Error]', err.message);
    return {
      success: false,
      output: err.stdout || '',
      error: err.stderr || err.message || 'Unknown execution error.'
    };
  }
}
