///<reference path="../vendor/fflate.d.ts" />
// import fflate from "../vendor/fflate.min";

(function (d: Document) {
	type FNameResult = { filename: string; reasons: string[] };
	type PrefixAccumulator = {
		/** Really a char[] */
		prefixes: string[];
		/** Explains why a prefix is present */
		reasons: string[];
	};

	enum GameType {
		SRB2,
		SRB2K,
		DRRR,
	}

	/** Assume every function here can throw */
	class WadReader {
		private position = 0;
		private data: DataView;

		constructor(buffer: ArrayBuffer) {
			this.data = new DataView(buffer, 0);
		}

		public getFourCC(): string {
			const bytes = new Uint8Array(this.data.buffer, this.position, 4);
			this.position += 4;
			const decoder = new TextDecoder("ascii");
			return decoder.decode(bytes);
		}

		public getU32(): number {
			const result = this.data.getUint32(this.position, true);
			this.position += 4;
			return result;
		}

		public seek(n: number) {
			this.position = n;
		}

		/**
		 * @returns {string} File name, normalized to upper case
		 */
		public getFileName(): string {
			const bytes = Array.from(
				new Uint8Array(this.data.buffer, this.position, 8),
			).filter((x) => {
				return x !== 0;
			});
			this.position += 8;
			const decoder = new TextDecoder("ascii");
			return decoder.decode(new Uint8Array(bytes)).toUpperCase();
		}

		public getU8ArrayAt(where: number, howMany: number): Uint8Array {
			return new Uint8Array(this.data.buffer, where, howMany);
		}
	}

	function arrayToUtf8(which: Uint8Array): string {
		const decoder = new TextDecoder("utf-8");
		return decoder.decode(which);
	}

	function makePrefixSort(game: GameType): (a: string, b: string) => number {
		// i have no fucking clue how to make this work
		// but let's just see!!!
		let map: Record<string, number>;
		switch (game) {
			case GameType.SRB2:
				map = {
					P: 0,
					S: 1,
					R: 2,
					M: 3,
					F: 4,
					C: 5,
					L: 6,
				};
				break;
			case GameType.DRRR:
				map = {
					D: 0,
					R: 1,
					B: 2,
					S: 3,
					T: 4,
					C: 5,
					F: 6,
					L: 7,
				};
				break;
			case GameType.SRB2K:
				map = {
					K: 0,
					R: 1,
					B: 2,
					C: 3,
					L: 4,
				};
				break;
			default:
				throw new Error("unknown game type");
		}
		return function (a: string, b: string): number {
			const ai = map[a];
			const bi = map[b];

			// if both are present
			if (ai !== undefined && bi !== undefined) {
				return ai - bi;
			}

			// only a
			if (ai !== undefined) {
				return -1;
			}

			// only b
			if (bi !== undefined) {
				return 1;
			}

			return 0;
		};
	}

	function processSOCCommon(
		soc: string,
		game: GameType,
		p: PrefixAccumulator,
	): void {
		// SOC is parsed in a case-insensitive and ad-hoc way
		// in the actual game, so we do likewise herre
		soc.split(/\r?\n/).forEach((line) => {
			if (line[0] === "#") {
				// is comment line, skip
				return;
			}

			// Internally the SOC is normalized, which makes it
			// easier for us
			let configLine = line
				.toLowerCase()
				.trim()
				.split(/\s*=\s*/, 2);

			// min length of configLine assumed to be 1
			if (configLine.length === 2) {
				// is key = value
				if (configLine[0] === "typeoflevel") {
					let types = configLine[1].split(/\s*,\s*/);
					// a doozy
					if (
						p.prefixes.indexOf("S") < 0 &&
						(types.indexOf("singleplayer") > -1 ||
							types.indexOf("single") > -1 ||
							types.indexOf("solo") > -1 ||
							types.indexOf("sp") > -1 ||
							types.indexOf("co-op") > -1 ||
							types.indexOf("coop") > -1 ||
							types.indexOf("competition") > -1)
					) {
						p.prefixes.push("S");
						p.reasons.push(
							"At least one level exists where the type is Single Player, Co-op, or Competition",
						);
					} else if (
						p.prefixes.indexOf("R") < 0 &&
						types.indexOf("race") > -1
					) {
						p.prefixes.push("R");
						p.reasons.push("At least one level exists where the type is Race");
					} else if (
						p.prefixes.indexOf("M") < 0 &&
						types.indexOf("match") > -1
					) {
						p.prefixes.push("M");
						p.reasons.push("At least one level exists where the type is Match");
					} else if (
						game !== GameType.DRRR &&
						p.prefixes.indexOf("F") < 0 &&
						types.indexOf("ctf") > -1
					) {
						p.prefixes.push("F");
						p.reasons.push("At least one level exists where the type is CTF");
					} else if (
						p.prefixes.indexOf("B") < 0 &&
						types.indexOf("battle") > -1
					) {
						p.prefixes.push("B");
						p.reasons.push(
							"At least one level exists where the type is Battle",
						);
					} else if (
						p.prefixes.indexOf("T") < 0 &&
						types.indexOf("tutorial") > -1
					) {
						p.prefixes.push("T");
						p.reasons.push(
							"At least one level exists where the type is Tutorial",
						);
					}
				}
			} else {
				// length = 1
				if (configLine[0] === "") {
					return;
				} else {
					if (
						p.prefixes.indexOf("C") < 0 &&
						/^character\s?/im.test(configLine[0])
					) {
						p.prefixes.push("C");
						p.reasons.push("At least one character exists in the SOC");
					} else if (
						game === GameType.DRRR &&
						p.prefixes.indexOf("F") < 0 &&
						/^follower\s?/im.test(configLine[0])
					) {
						p.prefixes.push("F");
						p.reasons.push("At least one follower exists in the SOC");
					}
				}
			}
		});
	}

	function addGamePrefix(game: GameType, prefixAccumulator: PrefixAccumulator) {
		switch (game) {
			case GameType.SRB2K:
				prefixAccumulator.prefixes.push("K");
				prefixAccumulator.reasons.push("This is an SRB2K mod");
				break;
			case GameType.DRRR:
				prefixAccumulator.prefixes.push("D");
				prefixAccumulator.reasons.push("This is a DRRR mod");
				break;
			default:
				break;
		}
	}

	function processWad(
		f: File,
		name: string,
		version: string,
		game: GameType,
	): Promise<FNameResult> {
		return new Promise((ok, err) => {
			let fr = new FileReader();
			// Define handlers
			fr.onerror = function (e) {
				err(new Error(e.target?.error?.message || "unknown error"));
			};
			fr.onload = function (e) {
				let raw = e.target?.result;
				if (!(raw instanceof ArrayBuffer)) {
					err(new Error("data can't be read for some reason"));
				}
				let prefixAccumulator: PrefixAccumulator = {
					prefixes: [],
					reasons: [],
				};
				addGamePrefix(game, prefixAccumulator);
				// Let's just let "file too short" errors be.
				// They'll be totally-comprehensible RangeErrors :p
				try {
					let data = new WadReader(raw as ArrayBuffer);
					// WADs must start with either:
					//   - IWAD (internal WAD)
					//   - PWAD (patch WAD)
					//   - SDLL (demo 4 hidden WAD)
					// ZWAD is not supported yet.
					let fourCC = data.getFourCC();
					switch (fourCC) {
						case "PWAD":
						case "IWAD":
						case "SDLL":
							console.log(`WAD identifier is ${fourCC}`);
							break;
						case "ZWAD":
							throw new Error("ZWAD is not supported yet");
						default:
							throw new Error("not a valid WAD file");
					}
					let nLumps = data.getU32();
					//console.log(`number of lumps to scan: ${nLumps}`);
					let dirLoc = data.getU32();
					//console.log(`location of directory: ${dirLoc}`);
					data.seek(dirLoc);

					// Process the WAD
					let atLeastOneLua = false;
					for (let i = 0; i < nLumps; i++) {
						let filePos = data.getU32();
						let fileSize = data.getU32();
						let fileName = data.getFileName();
						// Got at least one Lua script
						if (fileName.startsWith("LUA_")) {
							atLeastOneLua = true;
						}
						// Got SOC
						else if (fileName === "MAINCFG" || fileName.startsWith("SOC")) {
							let mainCfg = arrayToUtf8(data.getU8ArrayAt(filePos, fileSize));
							processSOCCommon(mainCfg, game, prefixAccumulator);
						}
					}
					if (atLeastOneLua) {
						prefixAccumulator.prefixes.push("L");
						prefixAccumulator.reasons.push(
							"At least one Lua script is present",
						);
					}
					// Return result
					ok({
						filename:
							prefixAccumulator.prefixes.sort(makePrefixSort(game)).join("") +
							"_" +
							name +
							"_v" +
							version +
							".wad",
						reasons: prefixAccumulator.reasons,
					});
				} catch (e) {
					console.error(e);
					err(e);
				}
			};
			// Run the thing
			fr.readAsArrayBuffer(f);
		});
	}

	function processPk3(
		f: File,
		name: string,
		version: string,
		game: GameType,
	): Promise<FNameResult> {
		return new Promise((ok, err) => {
			let fr = new FileReader();

			fr.onerror = function (e) {
				err(new Error(e.target?.error?.message || "unknown error"));
			};

			fr.onload = async function (e) {
				let raw = e.target?.result;
				if (!(raw instanceof ArrayBuffer)) {
					err(new Error("data can't be read for some reason"));
				}
				let fileData = raw as ArrayBuffer;
				let prefixAccumulator: PrefixAccumulator = {
					prefixes: [],
					reasons: [],
				};
				addGamePrefix(game, prefixAccumulator);

				let atLeastOneLua = false;
				try {
					let unzipped = fflate.unzipSync(
						new Uint8Array(fileData, 0, fileData.byteLength),
					);
					for (let filename in unzipped) {
						if (filename.slice(-1) === "/") {
							// must be a folder
							continue;
						}
						let iNorm = filename.toLowerCase();
						let fileContent = unzipped[filename];
						if (iNorm.startsWith("soc/")) {
							let soc = arrayToUtf8(fileContent);
							processSOCCommon(soc, game, prefixAccumulator);
						} else if (
							(iNorm.startsWith("lua/") && iNorm.length > "lua/".length) ||
							iNorm == "init.lua"
						) {
							atLeastOneLua = true;
						} else if (
							(iNorm.endsWith("p_skin") || iNorm.endsWith("s_skin")) &&
							prefixAccumulator.prefixes.indexOf("C") < 0
						) {
							prefixAccumulator.prefixes.push("C");
							prefixAccumulator.reasons.push(
								"At least one P_SKIN or S_SKIN lump is present",
							);
						}
					}
					if (atLeastOneLua) {
						prefixAccumulator.prefixes.push("L");
						prefixAccumulator.reasons.push(
							"At least one Lua script is present",
						);
					}
					// Return result
					ok({
						filename:
							prefixAccumulator.prefixes.sort(makePrefixSort(game)).join("") +
							"_" +
							name +
							"_v" +
							version +
							".pk3",
						reasons: prefixAccumulator.reasons,
					});
				} catch (e) {
					console.error(e);
					err(e);
				}
			};

			fr.readAsArrayBuffer(f);
		});
	}

	async function doTheThing(
		name: string,
		version: string,
		target: string,
		fileInput: HTMLInputElement,
		fileNameResult: HTMLPreElement,
		reasonsResult: HTMLOListElement,
	) {
		let normName = name.trim().replaceAll("'", "").replaceAll(" ", "_");
		let normVersion = version.trim().replaceAll("'", "").replaceAll(" ", "_");

		// Check name and version inputs
		if (normName.length < 1) {
			fileNameResult.innerText = "Mod name is empty!";
			return;
		}
		if (normVersion.length < 1) {
			fileNameResult.innerText = "Version is empty!";
			return;
		}

		// Determine game type
		let gameType: GameType;
		switch (target) {
			case "srb2":
				gameType = GameType.SRB2;
				break;
			case "srb2k":
				gameType = GameType.SRB2K;
				break;
			case "drrr":
				gameType = GameType.DRRR;
				break;
			default: {
				fileNameResult.innerText = "Invalid target!";
				return;
			}
		}

		// Check file upload form validity
		let files = fileInput.files;
		if (!files) {
			fileNameResult.innerText = "Not a file upload form?";
			return;
		}
		if (files.length < 1) {
			fileNameResult.innerText = "No files!";
			return;
		}
		if (files.length > 1) {
			fileNameResult.innerText = "Multiple files unsupported";
			return;
		}

		// Actually process the file
		let fileToProcess = files[0];
		let extension = fileToProcess.name
			.substring(fileToProcess.name.length - 1 - 3)
			.toLowerCase();
		let reasonsList: string[];
		let res: FNameResult;
		fileNameResult.innerText =
			"Depending on the size, this may take a while, please wait…";
		switch (extension) {
			case ".pk3":
				try {
					const result = await processPk3(
						fileToProcess,
						normName,
						normVersion,
						gameType,
					);
					fileNameResult.innerText = result.filename;
					reasonsList = result.reasons;
				} catch (e) {
					fileNameResult.innerText = `Cannot process file: ${e.message}`;
					return;
				}
				break;
			case ".wad":
			case ".dll": // weird Demo 4 format
				try {
					const result = await processWad(
						fileToProcess,
						normName,
						normVersion,
						gameType,
					);
					fileNameResult.innerText = result.filename;
					reasonsList = result.reasons;
				} catch (e) {
					fileNameResult.innerText = `Cannot process file: ${e.message}`;
					return;
				}
				break;
			default:
				fileNameResult.innerText = "Not a pk3 or wad!";
				return;
		}

		// Clear the reasons container
		for (
			let a = reasonsResult.firstChild;
			a !== null;
			a = reasonsResult.firstChild
		) {
			reasonsResult.removeChild(a);
		}

		// Insert reasons
		for (const reason of reasonsList) {
			let newReason = d.createElement("li");
			newReason.appendChild(d.createTextNode(reason));
			reasonsResult.appendChild(newReason);
		}

		// OK
	}

	// Entry point
	d.addEventListener("DOMContentLoaded", function () {
		// Submit button
		let theThingDoer = d.getElementById("do-the-thing") as HTMLInputElement;

		// Inputs
		let targetInput = d.getElementById("target-input") as HTMLSelectElement;
		let versionInput = d.getElementById("version-input") as HTMLInputElement;
		let nameInput = d.getElementById("name-input") as HTMLInputElement;
		let fileInput = d.getElementById("file-input") as HTMLInputElement;

		// Result containers
		let fnResultContainer = d.getElementById(
			"file-name-result",
		) as HTMLPreElement;
		let reasonsContainer = d.getElementById(
			"reasons-viewer",
		) as HTMLOListElement;

		theThingDoer.addEventListener("click", function (e) {
			e.preventDefault();
			doTheThing(
				nameInput.value,
				versionInput.value,
				targetInput.value,
				fileInput,
				fnResultContainer,
				reasonsContainer,
			);
		});
	});
})(document);
