
import fs from "fs";
import path from "path";
import solc from "solc";

const contractPath = "contracts/ConsentManager.sol";
const source = fs.readFileSync(contractPath, "utf8");

const input = {
    language: "Solidity",
    sources: {
        "ConsentManager.sol": {
            content: source
        }
    },
    settings: {
        outputSelection: {
            "*": {
                "*": [
                    "abi",
                    "evm.bytecode"
                ]
            }
        }
    }
};

const output = JSON.parse(
    solc.compile(JSON.stringify(input))
);

if (output.errors) {
    const errors = output.errors.filter(
        (error) => error.severity === "error"
    );

    if (errors.length > 0) {
        console.error(errors);
        process.exit(1);
    }
}

const contract =
    output.contracts["ConsentManager.sol"]["ConsentManager"];

const artifactDir =
    "artifacts/contracts/ConsentManager.sol";

fs.mkdirSync(artifactDir, { recursive: true });

const artifact = {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object
};

fs.writeFileSync(
    path.join(artifactDir, "ConsentManager.json"),
    JSON.stringify(artifact, null, 2)
);

console.log("ConsentManager compiled successfully!");
console.log(
    "Artifact created:",
    path.join(artifactDir, "ConsentManager.json")
);