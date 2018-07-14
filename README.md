# Disassembly Explorer

Shows the filtered assembly output and it relations to original source.

Regular disassembly may be generated with:

    $(CC) -g -o disassembly.S $(CFLAGS) -S source.c

Objdumped disassembly should be generated with lines info:

    objdump -d compiled.bin -l > disassembly.S

## TODO

- [x] Highlight asm lines related to selected source line and vice versa
- [x] Higlight current line immediately (not only on selection change)
- [x] Remove decorations when user switches to different file
- [ ] Restore decorations when user switches to original file
- [x] Scroll to first highlighted line if it is out of view
- [ ] Colorize source and asm lines as in Compiler Explorer
- [x] Tint unused source lines
- [x] Add configuration for relations of source path to disassembly path
- [x] Add configuration option for binary asm parsing
- [x] If asm file was missing, try to reload on next time instead of showing
      cached document
- [x] Be aware of file changes (asm should be reloaded)
- [x] Do not suppose that asm has only one source file - this may lead to
      false-positive line matches
- [ ] Provide links for lines like `ja 24a7 <rasterize+0x7d7>`
