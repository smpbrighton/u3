/** 같은 설정 파일을 갱신하는 API를 직렬화하고, 저장 실패 시 다시 시작을 막는다. */
export class SettingsSaves {
  private pending: Promise<void> = Promise.resolve();
  private failures = new Map<string, unknown>();

  run<T>(resource: string, save: () => Promise<T>): Promise<T> {
    const next = this.pending.then(save).then(value => {
      this.failures.delete(resource);
      return value;
    }, error => {
      this.failures.set(resource, error);
      throw error;
    });
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }

  async flush(): Promise<void> {
    await this.pending;
    if (this.failures.size) throw this.failures.values().next().value;
  }
}
