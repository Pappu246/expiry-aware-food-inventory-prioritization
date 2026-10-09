CC ?= gcc
CPPFLAGS += -D_POSIX_C_SOURCE=200809L -Iinclude
CFLAGS ?= -std=c11 -Wall -Wextra -Wpedantic -Werror -O2
.PHONY: all test test-sanitize operations clean
all: build/fefo
build:
	mkdir -p build
build/fefo: src/main.c src/engine.c include/fefo/engine.h | build
	$(CC) $(CPPFLAGS) $(CFLAGS) src/main.c src/engine.c -lm -o $@
build/fefo_tests: tests/test_main.c src/engine.c include/fefo/engine.h | build
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_main.c src/engine.c -lm -o $@
test: build/fefo_tests
	./build/fefo_tests
build/fefo_tests_sanitize: tests/test_main.c src/engine.c include/fefo/engine.h | build
	$(CC) $(CPPFLAGS) -std=c11 -Wall -Wextra -Wpedantic -Werror -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer tests/test_main.c src/engine.c -lm -o $@
test-sanitize: build/fefo_tests_sanitize
	ASAN_OPTIONS=detect_leaks=1:abort_on_error=1 UBSAN_OPTIONS=halt_on_error=1 ./build/fefo_tests_sanitize
build/fefo_operations: tests/operation_counts.c src/engine.c include/fefo/engine.h | build
	$(CC) $(CPPFLAGS) $(CFLAGS) -DFEFO_ENABLE_OPERATION_METRICS tests/operation_counts.c src/engine.c -o $@
operations: build/fefo_operations
	./build/fefo_operations
clean:
	rm -rf build
