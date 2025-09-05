import { stub } from "jest-micro-auto-stub";
import ChainManager from "../../board/chain-manager";
import ChainInterceptor from "../chain-interceptor";

describe("ChainInterceptor", () => {
    let chainManager;
    let logService;
    let interceptor;

    beforeEach(() => {
        chainManager = stub(ChainManager);
        logService = {
            log: jest.fn(),
            logWarning: jest.fn(),
            logError: jest.fn(),
        };

        interceptor = new ChainInterceptor({ resultChainManager: chainManager, logService });
    });

    describe("shouldIntercept", () => {
        it("should always return true", () => {
            const player = { profile: { name: "testPlayer" } };
            const bet = { totalAmount: 10 };

            const result = interceptor.shouldIntercept(player, bet);

            expect(result).toBe(true);
        });
    });

    describe("afterSuccessEvent", () => {
        const player = { profile: { name: "testPlayer" } };
        const context = { player, bet: { totalAmount: 10 }, balance: 100 };

        it("should assign chain when player needs assignment", async () => {
            chainManager.shouldAssignChain.mockReturnValue(true);
            chainManager.assignChain.mockReturnValue(true);

            const result = await interceptor.afterSuccessEvent(context);

            expect(chainManager.shouldAssignChain).toHaveBeenCalledWith("testPlayer");
            expect(chainManager.assignChain).toHaveBeenCalledWith("testPlayer");
            expect(logService.log).not.toHaveBeenCalled();
            expect(logService.logWarning).not.toHaveBeenCalled();
            expect(result).toBe(context);
        });

        it("should not assign chain when player already has one", async () => {
            chainManager.shouldAssignChain.mockReturnValue(false);

            const result = await interceptor.afterSuccessEvent(context);

            expect(chainManager.shouldAssignChain).toHaveBeenCalledWith("testPlayer");
            expect(chainManager.assignChain).not.toHaveBeenCalled();
            expect(logService.log).not.toHaveBeenCalled();
            expect(logService.logWarning).not.toHaveBeenCalled();
            expect(result).toBe(context);
        });

        it("should log warning when chain assignment fails", async () => {
            chainManager.shouldAssignChain.mockReturnValue(true);
            chainManager.assignChain.mockReturnValue(false);

            const result = await interceptor.afterSuccessEvent(context);

            expect(chainManager.assignChain).toHaveBeenCalledWith("testPlayer");
            expect(logService.logWarning).toHaveBeenCalledWith("No chains available for testPlayer");
            expect(result).toBe(context);
        });

        it("should handle errors gracefully", async () => {
            const error = new Error("Test error");
            chainManager.shouldAssignChain.mockImplementation(() => {
                throw error;
            });

            const result = await interceptor.afterSuccessEvent(context);

            expect(logService.logError).toHaveBeenCalledWith(error);
            expect(result).toBe(context);
        });
    });
});
