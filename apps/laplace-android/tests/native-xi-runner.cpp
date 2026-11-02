// Host harness: the same pinned runtime and isolated memory used by Android JNI.
#include "mundo_x/quantum_runtime.hpp"
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
int main(int argc, char** argv) {
  try {
    if (argc != 2) throw std::invalid_argument("usage: native-xi-runner program.xi");
    std::ifstream input(argv[1]);
    if (!input) throw std::runtime_error("program unavailable");
    const std::string source((std::istreambuf_iterator<char>(input)), {});
    mundo_x::QuantumRuntime runtime;
    std::cout << runtime.execute(source);
  } catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
