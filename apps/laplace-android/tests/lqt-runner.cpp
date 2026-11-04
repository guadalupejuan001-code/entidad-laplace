#include "laplace_temporal.hpp"
#include <fstream>
#include <iostream>
#include <iterator>
std::string read(const char* path){std::ifstream f(path);if(!f)throw std::runtime_error("file unavailable");return std::string(std::istreambuf_iterator<char>(f),{});}
int main(int argc,char** argv){try{
 if(argc<2||argc>3)throw std::invalid_argument("usage: lqt-runner program.xi [checkpoint.lqt]");
 mundo_x::laplace::TemporalXiRuntime runtime;std::cout<<runtime.execute(read(argv[1]),argc==3?read(argv[2]):"")<<'\n';
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
