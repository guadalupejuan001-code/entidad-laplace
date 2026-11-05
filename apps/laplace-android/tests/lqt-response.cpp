#include "laplace_temporal.hpp"
#include <fstream>
#include <iostream>
#include <iterator>
using namespace mundo_x::laplace;
int main(int argc,char** argv){try{
 require(argc==3,"usage: lqt-response checkpoint bars.tsv");
 std::ifstream checkpoint_file(argv[1]),input(argv[2]);require(bool(checkpoint_file)&&bool(input),"response input missing");
 std::string checkpoint(std::istreambuf_iterator<char>(checkpoint_file),{}),magic;int version,eq,q,lag;Config config;
 std::istringstream header(checkpoint);header>>magic>>version>>config.asset>>config.granularity>>config.horizon>>eq>>q>>lag;config.equity=eq;
 std::vector<Candle> bars;Candle candle;while(input>>candle.time>>candle.low>>candle.high>>candle.open>>candle.close>>candle.volume>>candle.session)bars.push_back(candle);
 require(!bars.empty(),"response candles missing");config.asof=bars.back().time+config.granularity;
 Dataset data(config,bars);Model model=Model::restore(checkpoint,config,q),initial;
 TemporalCircuit circuit(wires,channels,model.lag);auto test=data.collect(bars.size()*85/100,bars.size(),64);
 Model reset=model,bias_only=model;reset.theta=initial.theta;std::fill(bias_only.weights.begin(),bias_only.weights.end(),0);
 auto shuffled=test;for(std::size_t i=0;i<test.size();i++)shuffled[i].angles=test[(i+test.size()/2)%test.size()].angles;
 double price_response=0,probability_response=0,max_theta_change=0,mean_theta_change=0;
 for(std::size_t i=0;i<test.size();i++){
  auto original=model.forward(circuit,test[i]),changed=model.forward(circuit,shuffled[i]);
  price_response+=std::abs(original[0]-changed[0])/test.size();
  probability_response+=std::abs(sigmoid(original[3]/model.temperature)-sigmoid(changed[3]/model.temperature))/test.size();
 }
 for(std::size_t i=0;i<wires;i++){
  double delta=std::abs(model.theta[i]-initial.theta[i]);max_theta_change=std::max(max_theta_change,delta);mean_theta_change+=delta/wires;
 }
 std::cout<<std::setprecision(17)<<"{\"minutes\":"<<config.horizon*config.granularity/60
  <<",\"test\":"<<metrics_json(model.evaluate(circuit,test))<<",\"resetTheta\":"<<metrics_json(reset.evaluate(circuit,test))
  <<",\"biasOnly\":"<<metrics_json(bias_only.evaluate(circuit,test))<<",\"shuffledFeatures\":"<<metrics_json(model.evaluate(circuit,shuffled))
  <<",\"meanAbsoluteNormalizedPriceResponse\":"<<price_response<<",\"meanAbsoluteProbabilityResponse\":"<<probability_response
  <<",\"maxThetaChangeRadians\":"<<max_theta_change<<",\"meanThetaChangeRadians\":"<<mean_theta_change<<"}\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
