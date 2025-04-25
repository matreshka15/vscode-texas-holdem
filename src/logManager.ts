export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export class LogManager {
    private logs: { timestamp: string; level: LogLevel; message: string }[] = [];
    private maxLogs: number;

    constructor(maxLogs: number = 50) {
        this.maxLogs = maxLogs;
    }

    addLog(message: string, level: LogLevel = 'INFO'): void {
        const timestamp = new Date().toLocaleTimeString();
        this.logs.unshift({ timestamp, level, message });
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
    }

    clearLogs(): void {
        this.logs = [];
    }

    getLogs(levelFilter?: LogLevel): string[] {
        if (levelFilter) {
            return this.logs
                .filter(log => log.level === levelFilter)
                .map(log => `[${log.timestamp}] [${log.level}] ${log.message}`);
        }
        return this.logs.map(log => `[${log.timestamp}] [${log.level}] ${log.message}`);
    }

    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }

    saveLogsToFile(filePath: string): void {
        const fs = require('fs');
        fs.writeFileSync(filePath, this.exportLogs(), 'utf-8');
    }

    loadLogsFromFile(filePath: string): void {
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const parsedLogs = JSON.parse(fileContent);
            if (Array.isArray(parsedLogs)) {
                this.logs = parsedLogs.slice(0, this.maxLogs);
            }
        }
    }
}