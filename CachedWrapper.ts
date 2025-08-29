export class CachedWrapper<T extends object> {
    private cache = new Map<PropertyKey, unknown>();

    constructor(private target: T) { }

    ClearCache() { this.cache.clear(); }

    get proxy(): T {
        return new Proxy(this.target, {
            get: (obj, prop: string | symbol, receiver: any): any => {
                if (this.cache.has(prop)) {
                    return this.cache.get(prop);
                } else {
                    const value = Reflect.get(obj, prop, receiver);
                    this.cache.set(prop, value);
                    return value;
                }
            },
        });
    }
}
