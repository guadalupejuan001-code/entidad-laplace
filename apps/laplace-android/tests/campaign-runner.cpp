#include "laplace_campaign.hpp"
#include <iostream>
#include <iterator>
std::string read(const char* p){std::ifstream f(p);if(!f)throw std::runtime_error("file missing");return std::string(std::istreambuf_iterator<char>(f),{});}
int main(int argc,char** argv){try{mundo_x::laplace::CampaignXiRuntime runtime;std::cout<<runtime.execute(read(argv[1]),argc>2?read(argv[2]):"")<<'\n';}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
