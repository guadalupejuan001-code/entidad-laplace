#include "laplace_temporal.hpp"
#include <iostream>
using namespace mundo_x::laplace;
void check(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
std::vector<Example> interaction_examples(std::size_t repetitions,std::uint32_t seed){
 std::vector<Example> examples;std::mt19937 rng(seed);
 for(std::size_t i=0;i<repetitions*4;i++){
  Example e;e.angles.assign(wires,.65);bool x=i%4<2,y=i%2==0;
  // Independent continuous draws, with the same support in train and test.
  // Four repeated corner points would only test memorization of those corners.
  std::uniform_real_distribution<double> jitter(0,.1);
  auto angle=[&](bool high){return (high?.85:.35)+jitter(rng);};
  e.angles[3]=angle(x);e.angles[4]=angle(y); // A CZ crosses the former four-wire boundary.
  double signal=x!=y?1:-1;e.target={signal,0,0,double(signal>0)};
  e.reference=100;e.return_scale=.01;e.volatility_base=1;e.volume_base=1;
  e.actual={100*std::exp(signal*.01),1,1};examples.push_back(std::move(e));
 }return examples;
}
Model controlled_fit(const TemporalCircuit& circuit,const std::vector<Example>& train,bool quantum){
 Model model;model.quantum=quantum;model.prepare_inputs(circuit,train);
 std::vector<std::size_t> order(train.size());std::iota(order.begin(),order.end(),0);std::mt19937 rng(10292026);
 for(int epoch=0;epoch<24;epoch++){
  std::shuffle(order.begin(),order.end(),rng);for(auto i:order)model.learn(circuit,train[i]);
 }return model;
}
double accuracy(const Model& model,const TemporalCircuit& circuit,const std::vector<Example>& examples){
 double correct=0;for(const auto& e:examples)correct+=(model.forward(circuit,e)[3]>0)==(e.target[3]>0);
 return correct/examples.size();
}
int main(){try{
 // Seed 7021 was a development validation set. Reserve a separate seed and
 // 256 fresh cases after the optimizer and training budget have been fixed.
 TemporalCircuit circuit;auto train=interaction_examples(64,3021),validation=interaction_examples(32,7021),unseen=interaction_examples(64,20261104);
 Model quantum=controlled_fit(circuit,train,true),classical=controlled_fit(circuit,train,false),initial;
 double quantum_accuracy=accuracy(quantum,circuit,unseen),classical_accuracy=accuracy(classical,circuit,unseen);
 double quantum_loss=quantum.validation_loss(circuit,unseen),classical_loss=classical.validation_loss(circuit,unseen);
 Model reset=quantum;reset.theta=initial.theta;double reset_loss=reset.validation_loss(circuit,unseen);
 auto low=unseen[0],flipped=low;flipped.angles[3]=unseen[2].angles[3];
 double response=std::abs(quantum.forward(circuit,low)[3]-quantum.forward(circuit,flipped)[3]);
 // Normalized-observable derivatives include the rotation-dependent mean.
 std::vector<double> observed,derivative;quantum.forward(circuit,low,&observed,&derivative);
 double gradient_error=0;for(std::size_t i:{std::size_t(3),std::size_t(4)}){
  Model plus=quantum,minus=quantum;plus.theta[i]+=1e-5;minus.theta[i]-=1e-5;
  std::vector<double> a,b;plus.forward(circuit,low,&a);minus.forward(circuit,low,&b);
  gradient_error=std::max(gradient_error,std::abs((a[i]-b[i])/2e-5-derivative[i]));
 }
 std::vector<double> raw;circuit.observe(low.angles,quantum.theta,raw);double centering_error=0;
 for(std::size_t i=0;i<wires;i++){
  double expected=(raw[i]-std::cos(quantum.theta[i])*quantum.mean_a[i]+std::sin(quantum.theta[i])*quantum.mean_b[i])/quantum.scale[i];
  centering_error=std::max(centering_error,std::abs(observed[i]-expected));
 }
 double theta_change=0;for(std::size_t i=0;i<wires;i++)theta_change=std::max(theta_change,std::abs(quantum.theta[i]-initial.theta[i]));
 // A resumed optimizer must produce the identical NEXT learning step, not
 // merely reproduce the current inference with its readout weights.
 quantum.asset="BTC-USD";quantum.initial_updates=quantum.updates;quantum.validation_cases=8;quantum.calibration_cases=12;
 quantum.cursor=200;quantum.initial_through=300;
 quantum.test=quantum.evaluate(circuit,std::vector<Example>(unseen.begin(),unseen.begin()+64));
 Config context;context.asset="BTC-USD";context.horizon=3;context.asof=400;
 Model next=quantum,resumed=Model::restore(quantum.save(),context,true);check(resumed.save()==quantum.save(),"complete optimizer restore");
 next.learn(circuit,unseen.back());resumed.learn(circuit,unseen.back());
 check(resumed.save()==next.save(),"next optimizer step must survive a checkpoint exactly");
 std::cout<<std::setprecision(17)<<"{\"task\":\"held-out two-input XOR across CZ(3,4)\",\"trainCases\":"<<train.size()
  <<",\"validationCases\":"<<validation.size()<<",\"testSeed\":20261104,\"unseenCases\":"<<unseen.size()<<",\"quantumAccuracy\":"<<quantum_accuracy<<",\"matchedNoCZAccuracy\":"<<classical_accuracy
  <<",\"quantumLoss\":"<<quantum_loss<<",\"matchedNoCZLoss\":"<<classical_loss<<",\"resetThetaLoss\":"<<reset_loss
  <<",\"maxThetaChange\":"<<theta_change<<",\"inputResponseLogit\":"<<response<<",\"centeredGradientMaxError\":"<<gradient_error
  <<",\"centeredObservableMaxError\":"<<centering_error<<",\"optimizerNextStepIdentical\":true"
  <<",\"quantumUpdates\":"<<quantum.updates<<",\"matchedNoCZUpdates\":"<<classical.updates<<"}\n";
 check(quantum_accuracy>=.95,"connected circuit must learn unseen interaction");
 check(quantum.updates==classical.updates,"matched training budgets must be identical");
 check(classical_accuracy<=.75,"matched additive control cannot represent XOR");
 check(quantum_loss<classical_loss*.75,"circuit must contribute useful interaction features");
 check(response>.25,"new inputs must change the prediction");
 check(theta_change>.01,"rotation learning must be numerically meaningful");
 check(gradient_error<1e-8,"centered circuit gradient must be exact");
 check(centering_error<1e-12,"centering must preserve the exact observable");
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
