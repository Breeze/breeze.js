export {}

declare global {

    interface Promise<T> {
        finally(finallyCallback: () => any): Promise<T>;        
    }   
}

