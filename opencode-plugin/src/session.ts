export interface SessionState {
  dropperName: string;
  instructions: string;
}

export class SessionManager {
  private sessionStates = new Map<string, SessionState>();
  private sessionPruneMap = new Map<string, string>();

  setSession(sessionId: string, state: SessionState): void {
    this.sessionStates.set(sessionId, state);
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessionStates.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    this.sessionPruneMap.delete(sessionId);
  }

  setPruneMessageId(sessionId: string, messageId: string): void {
    this.sessionPruneMap.set(sessionId, messageId);
  }

  getPruneMessageId(sessionId: string): string | undefined {
    return this.sessionPruneMap.get(sessionId);
  }
}
