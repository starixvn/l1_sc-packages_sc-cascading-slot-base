// Status constants
const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

export default class ChainManager {
    /**
     * @param {Object} dependencies - Destructured dependencies for proxy injection
     * @param {SlotGameData} dependencies.gameData
     * @param {logger} dependencies.logService
     * @param {mongoose.Model} dependencies.resultChainRepository
     * @param {mongoose.Model} dependencies.assignmentRepository
     * @param {Object} dependencies.appConfigs
     */
    constructor({ gameData, logService, resultChainRepository, assignmentRepository, appConfigs }) {
        this.gameData = gameData;
        this.logService = logService;
        this.resultChainRepository = resultChainRepository;
        this.assignmentRepository = assignmentRepository;
        this.appConfigs = appConfigs;

        this.gameData.playerChains = this.gameData.playerChains || {};
        this.gameData.availableChains = this.gameData.availableChains || [];

        const { enabled = false, reload = false } = this.gameData.gameConfigs?.cascadingSlotsConfig?.resultChains || {};
        this.chainConfigs = { enabled, reload };
    }

    /**
     * Calculate normalized base bet amount with floating point precision fix
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {number} Normalized base bet amount
     */
    calculateBaseBetAmount(betLevel, coinValue) {
        return Math.round(betLevel * coinValue * 100) / 100;
    }

    /**
     * Generate consistent chain key from player name and bet parameters
     * @param {string} playerName - Player identifier
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {string} Normalized chain key
     */
    generateChainKey(playerName, betLevel, coinValue) {
        const baseBetAmount = this.calculateBaseBetAmount(betLevel, coinValue);
        return `${playerName}-${baseBetAmount.toFixed(2)}`;
    }

    /**
     * Check if player already has an active chain
     * @param {string} chainKey - Chain identifier
     * @returns {Object|null} Existing chain or null
     */
    findExistingChain(chainKey) {
        return this.gameData.playerChains[chainKey] || null;
    }

    /**
     * Update chain configurations from gameConfigs and handle reloading if needed
     * @param {Object} newChainConfigs - Configuration object with enabled and reload properties
     */
    async updateChainConfigs(newChainConfigs) {
        const previousConfigs = { ...this.chainConfigs };
        this.chainConfigs = { ...this.chainConfigs, ...newChainConfigs };

        if (previousConfigs.enabled !== this.chainConfigs.enabled) {
            this.logService.logError(
                `[GameID: ${this.gameData.gameConfigs?.gameId}] Result chains ${this.chainConfigs.enabled ? "enabled" : "disabled"} via gameConfigs`
            );
        }

        if (this.chainConfigs.enabled && this.chainConfigs.reload) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Reloading result chains due to configuration`);
            await this.reloadChainData();
        }
    }

    /**
     * Check if result chains are enabled from gameConfigs
     * @returns {boolean} - True if chains are enabled
     */
    isChainEnabled() {
        return this.chainConfigs.enabled;
    }

    /**
     * Load chains from database with configurable options
     * @param {Object} options - Loading options
     * @param {boolean} options.validateBoardsData - Whether to validate boardsData exists
     * @param {boolean} options.includeMetadata - Whether to include metadata and boards array
     */
    async loadChainsFromDatabase(options = {}) {
        const { validateBoardsData = false, includeMetadata = false } = options;

        if (!this.isChainEnabled()) {
            return;
        }

        try {
            const currentChainCount = this.gameData.availableChains.length;
            if (currentChainCount >= 200) {
                return;
            }

            const remainingSlots = 200 - currentChainCount;
            const resultChains = await this.resultChainRepository
                .find({ totalBoardCount: { $lt: 200 } })
                .sort({ _id: -1 })
                .limit(remainingSlots)
                .lean()
                .exec();

            for (const chain of resultChains) {
                if (validateBoardsData && (!chain.boardsData || chain.boardsData.length === 0)) {
                    continue;
                }

                const existingChain = this.gameData.availableChains.find((c) => c.name === chain.name);
                if (!existingChain) {
                    const chainData = {
                        name: chain.name,
                        baseBetAmount: chain.baseBetAmount,
                        totalBoardCount: chain.totalBoardCount,
                    };

                    if (includeMetadata) {
                        chainData.boards = [];
                        chainData.metadata = chain;
                    }

                    this.gameData.availableChains.push(chainData);
                }
            }
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load chains from database:`, error);
        }
    }

    async loadChainData() {
        await this.loadChainsFromDatabase({
            validateBoardsData: true,
            includeMetadata: false,
        });
    }

    async reloadChainData() {
        await this.loadChainsFromDatabase({
            validateBoardsData: false,
            includeMetadata: true,
        });
    }

    async getBoardsByChainName(chainName) {
        try {
            const chain = await this.resultChainRepository.findOne({ name: chainName }).lean().exec();

            return chain?.boardsData || null;
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load boards for chain ${chainName}:`, error);
            return null;
        }
    }

    /**
     * Get or load player chain from memory or database
     * @param {string} playerName - Player identifier
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {Promise<Object|null>} Player chain or null
     */
    async getPlayerChain(playerName, betLevel, coinValue) {
        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        const existingChain = this.findExistingChain(chainKey);

        if (existingChain) {
            return existingChain;
        }

        return await this.reloadChainFromDatabase(playerName, betLevel, coinValue);
    }

    async getNextResult(playerName, playerContext = {}, roundContext = {}) {
        if (!this.isChainEnabled()) {
            return null;
        }

        const { betLevel, coinValue } = playerContext;

        const playerChain = await this.getPlayerChain(playerName, betLevel, coinValue);
        if (!playerChain) {
            return null;
        }

        if (playerChain.currentIndex >= playerChain.totalBoards) {
            return null;
        }

        // If boards not loaded, load them
        if (!playerChain.boardsLoaded || !playerChain.boards) {
            const boards = await this.getBoardsByChainName(playerChain.name);
            if (!boards) {
                return null;
            }
            playerChain.boards = [...boards];
            playerChain.boardsLoaded = true;
        }

        // Update activity timestamp when chain is accessed
        playerChain.lastActivityAt = new Date();

        const currentBoard = playerChain.boards[playerChain.currentIndex];
        const boardResult = this.convertChainBoardToResult(currentBoard);

        return boardResult;
    }

    /**
     * Reload chain from database when not found in memory
     * @param {string} playerName - Player identifier
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {Promise<Object|null>} Reloaded chain or null
     */
    async reloadChainFromDatabase(playerName, betLevel, coinValue) {
        try {
            const activeAssignment = await this.assignmentRepository
                .findOne({
                    playerName,
                    betLevel,
                    coinValue,
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                })
                .lean()
                .exec();

            if (!activeAssignment) {
                return null; // No active assignment
            }

            // Create chain entry in memory from database data
            const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
            const playerChain = {
                name: activeAssignment.chainName,
                boards: null, // Will be loaded on-demand
                currentIndex: activeAssignment.currentBoardIndex,
                totalBoards: activeAssignment.totalBoards,
                assignedAt: new Date(activeAssignment.assignedAt),
                lastActivityAt: new Date(activeAssignment.lastActivityAt || activeAssignment.assignedAt),
                betLevel: activeAssignment.betLevel,
                coinValue: activeAssignment.coinValue,
                playerId: activeAssignment.playerId,
                playerName: activeAssignment.playerName,
                boardsLoaded: false,
            };

            this.gameData.playerChains[chainKey] = playerChain;

            return playerChain;
        } catch (error) {
            this.logService.logError(`Failed to reload chain from database: ${error.message}`);
            return null;
        }
    }

    convertChainBoardToResult(chainBoard) {
        if (chainBoard.settlementResult && chainBoard.settlementResult.tumbles) {
            const tumbles = chainBoard.settlementResult.tumbles;
            const result = [];

            for (let i = 0; i < tumbles.length; i++) {
                const tumble = tumbles[i];
                const preGeneratedItem = {
                    newBoard: tumble.originalBoard ? tumble.originalBoard.split(",").map((x) => parseInt(x)) : chainBoard.board,
                    multipliers: tumble.multipliers || chainBoard.multipliers || [],
                    explodedSymbols: [],
                    newSymbols: [],
                };

                // Settlement data from current tumble goes to the NEXT preGeneratedResult item
                // This is because cascade data describes what happens AFTER the current tumble
                if (i > 0) {
                    const previousTumble = tumbles[i - 1];
                    preGeneratedItem.explodedSymbols = previousTumble.explodedSymbols || [];
                    preGeneratedItem.newSymbols = previousTumble.newSymbols || [];
                }

                result.push(preGeneratedItem);
            }

            return result;
        }

        return [
            {
                newBoard: chainBoard.board,
                multipliers: chainBoard.multipliers || [],
                explodedSymbols: [],
                newSymbols: [],
            },
        ];
    }

    async shouldAssignChain(playerName, betLevel, coinValue) {
        if (!this.isChainEnabled()) {
            return false;
        }

        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        const memoryChain = this.findExistingChain(chainKey);
        if (memoryChain) {
            return false;
        }

        try {
            const activeAssignment = await this.assignmentRepository
                .findOne({
                    playerName,
                    betLevel,
                    coinValue,
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                })
                .lean()
                .exec();

            return !activeAssignment;
        } catch (error) {
            this.logService.logError(`Failed to check database for active chain assignment: ${error.message}`);
            return false;
        }
    }

    getChainStatus(playerName, betLevel, coinValue) {
        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        const playerChain = this.findExistingChain(chainKey);

        if (!playerChain) {
            return { hasChain: false };
        }

        return {
            hasChain: true,
            chainName: playerChain.name,
            progress: `${playerChain.currentIndex}/${playerChain.totalBoards}`,
            assignedAt: playerChain.assignedAt,
            betLevel: playerChain.betLevel,
            coinValue: playerChain.coinValue,
        };
    }
}
