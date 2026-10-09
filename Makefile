CC ?= gcc
CPPFLAGS += -D_POSIX_C_SOURCE=200809L -Iinclude
CFLAGS ?= -std=c11 -Wall -Wextra -Wpedantic -Werror -O2
.PHONY: all test clean
all: build/fefo
build:
	mkdir -p build
build/fefo: src/main.c src/engine.c include/fefo/engine.h | build
	$(CC) $(CPPFLAGS) $(CFLAGS) src/main.c src/engine.c -o $@
build/fefo_tests: tests/test_main.c src/engine.c include/fefo/engine.h | build
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_main.c src/engine.c -o $@
test: build/fefo_tests
	./build/fefo_tests
clean:
	rm -rf build
