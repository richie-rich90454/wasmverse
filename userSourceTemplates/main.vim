" WASMVerse Vim script showcase.
"
" Conventions: this script is executed with `vim -es -u NONE -S <entry>` inside
" a WebAssembly build of Vim. Every project file is written into Vim's
" filesystem at the same relative path, so `:source helper.vim` or
" `readfile('data.txt')` work. Program arguments are listed one per line in
" /wasmverse-args.txt. Print output by appending lines to /result.txt, for
" example `call writefile(['text'], '/result.txt', 'a')`; the performer prints
" that file when Vim exits.

call writefile([], '/result.txt')

function! s:Emit(line) abort
    call writefile([a:line], '/result.txt', 'a')
endfunction

call s:Emit('WASMVerse Vim script showcase')

call s:Emit('Stage one: string builtins over a word list')
let s:words = ['delta', 'alpha', 'charlie', 'bravo']
call s:Emit('sorted: ' . join(sort(copy(s:words)), ', '))
call s:Emit('uppercased: ' . toupper(join(sort(copy(s:words)), '-')))

call s:Emit('Stage two: buffer editing round trip')
call setline(1, ['alpha beta', 'gamma delta'])
let s:word_count = 0
for s:line in getline(1, '$')
    let s:word_count += len(split(s:line))
endfor
call s:Emit('buffer words: ' . s:word_count)
silent 1s/beta/omega/
call s:Emit('line 1 after edit: ' . getline(1))
silent %s/delta/DELTA/
call s:Emit('line 2 after edit: ' . getline(2))

call s:Emit('Stage three: program arguments')
if filereadable('/wasmverse-args.txt')
    let s:args = readfile('/wasmverse-args.txt')
    if len(s:args) > 0
        call s:Emit('arg0:' . s:args[0])
    else
        call s:Emit('arg0:none')
    endif
else
    call s:Emit('arg0:none')
endif

call s:Emit('Showcase complete.')
qall!
