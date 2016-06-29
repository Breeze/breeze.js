import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';

function run() {
    let sourceFileName: string;
    let outputFileName: string;
    let currentParameter: string;
    let modules: boolean = false;

    // Process command line parameters
    process.argv.forEach((val, index) => {

        if (index < 2) return;

        if (!currentParameter) {
            if (val === '-s' || val === '-source') {
                currentParameter = 'source';
                return;
            } else if (val === '-o' || val === '-output') {
                currentParameter = 'output';
                return;
            } else if (val === '-m' || val === '-modules') {
                modules = true;
            } else {
                throw new Error(`Unknown paramter: ${val}`);
            }
        }

        if (currentParameter === 'source') {
            sourceFileName = path.resolve(val);
        }

        if (currentParameter === 'output') {
            outputFileName = path.resolve(val);
        }

        currentParameter = null;
    });
    if (currentParameter) {
        throw new Error(`Invalid usuage of paramter: -${currentParameter}`);
    }

    if (!sourceFileName || !fs.existsSync(sourceFileName)) {
        throw new Error("Must specify a valid source file name.");
    }

    let sourceTemplate = fs.readFileSync(sourceFileName, 'utf8');
    sourceTemplate = sourceTemplate.replace(/\/\/~/g, '');
    let compiledTemplate = handlebars.compile(sourceTemplate);
    let output = compiledTemplate({ modules: modules});

    if (modules) {
        // Remove breeze prefix from all types
        output = output.replace(/breeze\./g, '');
    }

    fs.writeFileSync(outputFileName, output, 'utf8');
}

try {

    if (process.argv.length < 3) {
        console.log("Node script to convert annotated breeze.d.ts file to module definitions.");
        console.log("Usage: node dtsgen.js -s <source file> -o <output file> [-m]");
        console.log("    -m: If specified, generates module definitions.")
    } else {
        run();
    }

} catch (e) {
    console.log(`Unexpected error occured: ${e.message}`);
}