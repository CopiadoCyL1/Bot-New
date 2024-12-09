import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/app.ts',
    output: {
        file: 'dist/app.js',
        format: 'cjs', // Cambiado a 'cjs' para asegurar compatibilidad con Node.js
    },
    onwarn: (warning, warn) => {
        if (warning.code === 'UNRESOLVED_IMPORT') return;
        warn(warning); // Permite que otras advertencias se muestren
    },
    plugins: [
        nodeResolve({
            preferBuiltins: true,
            browser: false,
        }),
        commonjs(),
        typescript(),
    ],
};