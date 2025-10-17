const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
    INACTIVE: "inactive",
};

export default class ChainManager {
    /**
     * @param {Object} dependencies
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
        this.gameData.chainBoardsCache = this.gameData.chainBoardsCache || {};
    }

    /**
     * Calculate normalized base bet amount with floating point precision fix
     * @param {number} betLevel
     * @param {number} coinValue
     * @returns {number}
     */
    calculateBaseBetAmount(betLevel, coinValue) {
        return Math.round(betLevel * coinValue * 100) / 100;
    }

    /**
     * Generate consistent chain key from player name and bet parameters
     * @param {string} playerName
     * @param {number} betLevel
     * @param {number} coinValue
     * @returns {string}
     */
    generateChainKey(playerName, betLevel, coinValue) {
        const baseBetAmount = this.calculateBaseBetAmount(betLevel, coinValue);
        return `${playerName}-${baseBetAmount.toFixed(2)}`;
    }

    /**
     * Check if player already has an active chain
     * @param {string} chainKey
     * @returns {Object|null}
     */
    findExistingChain(chainKey) {
        return this.gameData.playerChains[chainKey] || null;
    }

    /**
     * Check if result chains are enabled from gameConfigs
     * @returns {boolean}
     */
    isChainEnabled() {
        return this.gameData.gameConfigs?.cascadingSlotsConfig?.resultChains?.enabled || false;
    }

    getNumberToLoad(availableChains, appConfigs) {
        const currentChainCount = availableChains.length;
        const { maxChains } = appConfigs?.resultChains || {};

        if (!maxChains) {
            this.logService.logError(`maxChains is not configured in appConfigs.resultChains`);
            return 0;
        }

        if (currentChainCount >= maxChains) {
            return 0;
        }

        return maxChains - currentChainCount;
    }

    /**
     * Get max valid board count from configuration
     * @returns {number}
     */
    getMaxValidBoardCount() {
        const { boardRange } = this.appConfigs?.resultChains?.assignment || {};
        return boardRange && boardRange.length > 0 ? Math.max(...boardRange) : 200;
    }

    /**
     * Fetch chains from database with board count limit
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async fetchChainsFromDatabase(limit) {
        const maxValidBoardCount = this.getMaxValidBoardCount();

        return await this.resultChainRepository
            .find({ totalBoardCount: { $lte: maxValidBoardCount } })
            .sort({ _id: -1 })
            .limit(limit)
            .lean()
            .exec();
    }

    /**
     * Add new chains to availableChains
     * @param {Array} newChains
     * @param {number} limit
     * @returns {number}
     */
    addNewChainsToAvailable(newChains, limit) {
        const chainsToAdd = Math.min(newChains.length, limit);

        for (let i = 0; i < chainsToAdd; i++) {
            const chain = newChains[i];
            const chainData = {
                name: chain.name,
                baseBetAmount: chain.baseBetAmount,
                totalBoardCount: chain.totalBoardCount,
            };
            this.gameData.availableChains.push(chainData);
        }

        return chainsToAdd;
    }

    /**
     * Load chains from database
     */
    async loadChains() {
        if (!this.isChainEnabled()) {
            return;
        }

        try {
            const remainingSlots = this.getNumberToLoad(this.gameData.availableChains, this.appConfigs);
            const resultChains = await this.fetchChainsFromDatabase(remainingSlots);

            for (const chain of resultChains) {
                const existingChain = this.gameData.availableChains.find((c) => c.name === chain.name);
                if (!existingChain) {
                    const chainData = {
                        name: chain.name,
                        baseBetAmount: chain.baseBetAmount,
                        totalBoardCount: chain.totalBoardCount,
                    };

                    this.gameData.availableChains.push(chainData);
                }
            }
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load chains:`, error);
        }
    }

    async getBoardsByChainName(chainName) {
        try {
            if (this.gameData.chainBoardsCache[chainName]) {
                return this.gameData.chainBoardsCache[chainName];
            }

            const chain = await this.resultChainRepository.findOne({ name: chainName }).lean().exec();
            const boardsData = chain?.boardsData || null;

            if (boardsData) {
                this.gameData.chainBoardsCache[chainName] = boardsData;
            }

            return boardsData;
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load boards for chain ${chainName}:`, error);
            return null;
        }
    }

    /**
     * Get or load player chain from memory or database
     * @param {string} playerName
     * @param {number} betLevel
     * @param {number} coinValue
     * @returns {Promise<Object|null>}
     */
    async getPlayerChain(playerName, betLevel, coinValue) {
        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        const existingChain = this.findExistingChain(chainKey);

        if (existingChain) {
            return existingChain;
        }

        return this.reloadChainFromDatabase(playerName, betLevel, coinValue);
    }

    async getNextResult(playerName, playerContext = {}, roundContext = {}) {
        if (!this.isChainEnabled() || roundContext.isFreeSpin) {
            return null;
        }

        const { betLevel, coinValue } = playerContext;

        const playerChain = await this.getPlayerChain(playerName, betLevel, coinValue);
        if (!playerChain || playerChain.currentIndex >= playerChain.totalBoards) {
            return null;
        }

        const boards = await this.getBoardsByChainName(playerChain.name);
        if (!boards) {
            return null;
        }

        playerChain.lastActivityAt = new Date();

        const currentBoard = boards[playerChain.currentIndex];

        return this.convertChainBoardToResult(currentBoard);
    }

    /**
     * Reload chain from database when not found in memory
     * @param {string} playerName
     * @param {number} betLevel
     * @param {number} coinValue
     * @returns {Promise<Object|null>}
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
                return null;
            }
            const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
            const playerChain = {
                name: activeAssignment.chainName,
                currentIndex: activeAssignment.currentBoardIndex,
                totalBoards: activeAssignment.totalBoards,
                assignedAt: new Date(activeAssignment.assignedAt),
                lastActivityAt: new Date(activeAssignment.lastActivityAt || activeAssignment.assignedAt),
                betLevel: activeAssignment.betLevel,
                coinValue: activeAssignment.coinValue,
                playerId: activeAssignment.playerId,
                playerName: activeAssignment.playerName,
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

    /**
     * Check if reload is enabled from gameConfigs
     * @returns {boolean}
     */
    isReloadEnabled() {
        return this.gameData.gameConfigs?.cascadingSlotsConfig?.resultChains?.reload || false;
    }

    /**
     * Get chains that exist in availableChains but not in database result
     * @param {Array} availableChains
     * @param {Array} dbChains
     * @returns {Array}
     */
    getDeactivatedChains(availableChains, dbChains) {
        const dbChainNames = new Set(dbChains.map((chain) => chain.name));
        return availableChains.filter((chain) => !dbChainNames.has(chain.name)).map((chain) => chain.name);
    }

    /**
     * Get chains that exist in database but not in availableChains
     * @param {Array} availableChains
     * @param {Array} dbChains
     * @returns {Array}
     */
    getNewChains(availableChains, dbChains) {
        const availableChainNames = new Set(availableChains.map((chain) => chain.name));
        return dbChains.filter((chain) => !availableChainNames.has(chain.name));
    }

    /**
     * Mark player chain assignments as inactive for deactivated chains
     * @param {Array} deactivatedChainNames
     * @returns {Promise<number>}
     */
    async markAssignmentsInactive(deactivatedChainNames) {
        if (deactivatedChainNames.length === 0) {
            return 0;
        }

        try {
            const result = await this.assignmentRepository.updateMany(
                {
                    chainName: { $in: deactivatedChainNames },
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                },
                {
                    $set: {
                        status: ASSIGNMENT_STATUS.INACTIVE,
                        deactivatedAt: new Date(),
                    },
                }
            );

            return result.modifiedCount;
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to mark assignments as inactive:`, error);
            return 0;
        }
    }

    /**
     * Remove player chains from memory cache for deactivated chains
     * @param {Array} deactivatedChainNames
     * @returns {number}
     */
    clearPlayerChainsCache(deactivatedChainNames) {
        const chainNamesSet = new Set(deactivatedChainNames);
        const keysToRemove = Object.keys(this.gameData.playerChains).filter((key) => {
            const playerChain = this.gameData.playerChains[key];
            return chainNamesSet.has(playerChain.name);
        });

        keysToRemove.forEach((key) => {
            delete this.gameData.playerChains[key];
        });

        return keysToRemove.length;
    }

    /**
     * Clear board cache for deactivated chains
     * @param {Array} deactivatedChainNames
     * @returns {number}
     */
    clearBoardsCache(deactivatedChainNames) {
        let removedCount = 0;
        deactivatedChainNames.forEach((chainName) => {
            if (this.gameData.chainBoardsCache[chainName]) {
                delete this.gameData.chainBoardsCache[chainName];
                removedCount++;
            }
        });

        return removedCount;
    }

    /**
     * Handle deactivated chains - remove from memory and mark as inactive
     * @param {Array} deactivatedChainNames
     */
    async handleDeactivatedChains(deactivatedChainNames) {
        if (deactivatedChainNames.length === 0) {
            return;
        }

        this.gameData.availableChains = this.gameData.availableChains.filter((chain) => !deactivatedChainNames.includes(chain.name));

        const modifiedCount = await this.markAssignmentsInactive(deactivatedChainNames);
        const playerChainsRemoved = this.clearPlayerChainsCache(deactivatedChainNames);
        const boardsRemoved = this.clearBoardsCache(deactivatedChainNames);

        this.logService.log(
            `[GameID: ${this.gameData.gameConfigs?.gameId}] Deactivated ${
                deactivatedChainNames.length
            } chains (${modifiedCount} assignments, ${playerChainsRemoved} player cache, ${boardsRemoved} board cache): ${deactivatedChainNames.join(
                ", "
            )}`
        );
    }

    /**
     * Reload chains from database - update availableChains with new chains and handle deactivated chains
     */
    async reloadChains() {
        if (!this.isChainEnabled() || !this.isReloadEnabled()) {
            return;
        }

        try {
            const dbChains = await this.fetchChainsFromDatabase(Number.MAX_SAFE_INTEGER);
            const newChains = this.getNewChains(this.gameData.availableChains, dbChains);
            const deactivatedChainNames = this.getDeactivatedChains(this.gameData.availableChains, dbChains);

            if (newChains.length > 0) {
                const remainingSlots = this.getNumberToLoad(this.gameData.availableChains, this.appConfigs);
                this.addNewChainsToAvailable(newChains, remainingSlots);
            }

            await this.handleDeactivatedChains(deactivatedChainNames);
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to reload chains:`, error);
        }
    }
}
