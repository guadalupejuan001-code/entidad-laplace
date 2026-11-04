#include "laplace_temporal.hpp"
#include "mundo_x/exact_t_experiment.hpp"
#include "mundo_x/pauli_observer.hpp"
#include <iostream>
using namespace mundo_x::laplace;
void check(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
int main(){try{
 // Independent original Ether Reduced representation, only at small widths.
 // Production never creates these exponentially sized product expansions.
 using R=mundo_x::ReducedExactTRepresentation;
 double maximum_error=0,maximum_gradient_error=0;
 for(std::size_t n:{2,5,8})for(std::size_t width:{1,2})for(int lag:{0,3,12}){
  TemporalCircuit c(n,width,lag);std::vector<double> a(n),t(n),z,d;
  for(std::size_t trial=0;trial<7;trial++){
   std::vector<R::ProductPair> product(n);
   for(std::size_t i=0;i<n;i++){
    a[i]=.35+.6*(.5+.5*std::sin(i*1.71+trial));t[i]=std::sin(i*.41+trial*2.1)*2.8;
    product[i]={std::complex<double>(std::cos(a[i]/2),0),std::complex<double>(std::sin(a[i]/2),0)};
   }
   auto ref=R::from_product(product,4096);
   for(std::size_t i=0;i<n;i++)for(auto j:c.neighbors(i))if(j>i)ref.controlled_z(i,j);
   c.observe(a,t,z,&d);
   for(std::size_t i=0;i<n;i++){
    double expected=std::cos(t[i])*ref.z_expectation(i)-std::sin(t[i])*ref.pauli_expectation(std::uint64_t(1)<<i,0).real();
    maximum_error=std::max(maximum_error,std::abs(expected-z[i]));
    auto shifted=t;std::vector<double> plus,minus;shifted[i]+=1e-5;c.observe(a,shifted,plus);shifted[i]-=2e-5;c.observe(a,shifted,minus);
    maximum_gradient_error=std::max(maximum_gradient_error,std::abs((plus[i]-minus[i])/2e-5-d[i]));
   }
  }
 }
 check(maximum_error<1e-10,"native Ether observable parity");check(maximum_gradient_error<1e-8,"circuit gradient parity");
 TemporalCircuit full;check(full.backbone().qubits()==1000&&full.edges()==1795,"one full temporal register");
 mundo_x_bridge::PauliObserver observer(full.backbone());
 for(std::size_t i=0;i<wires;i++){
  auto packed=full.backbone().generator_packed(i);
  check(observer.expectation({packed.x,packed.z,packed.phase})==1,"original Ether graph generator");
 }
 // A cross-component boundary from the old 4-wire design must carry a CZ.
 check(std::find(full.neighbors(3).begin(),full.neighbors(3).end(),4)!=full.neighbors(3).end(),"not four-wire partitions");
 TemporalCircuit long_memory(wires,channels,12);check(long_memory.edges()==2735,"learnable temporal topology");
 // Verify that an input at a neighboring wire changes the measured output.
 std::vector<double> a(wires,.6),theta(wires,.4),before,after;
 full.observe(a,theta,before);a[5]=.9;full.observe(a,theta,after);
 check(std::abs(after[0]-before[0])>1e-3,"neighbor data must affect an observable");
 Model model;std::vector<Example> training,unseen;
 for(int sample=0;sample<160;sample++){
  Example e;e.angles.resize(wires);double signal=std::sin(sample*.37);
  for(std::size_t i=0;i<wires;i++)e.angles[i]=.65+.27*std::sin(sample*.37+i*.003);
  e.target={.4+.2*signal,-.3+.1*signal,.2-.1*signal,double(signal>0)};
  (sample<128?training:unseen).push_back(e);
 }
 double loss_before=model.validation_loss(full,unseen);
 for(int epoch=0;epoch<5;epoch++)for(const auto& e:training)model.learn(full,e);
 double loss_after=model.validation_loss(full,unseen);
 check(loss_after<loss_before*.7,"must learn and generalize on controlled task");
 check(std::all_of(model.changed.begin(),model.changed.end(),[](auto x){return x>0;}),"all 1000 quantum parameters must learn");
 // No-edge ablation is the exact independent-rotation cosine model.
 full.observe(a,theta,before,nullptr,false);
 for(std::size_t i=0;i<wires;i++)check(std::abs(before[i]-std::cos(a[i]+theta[i]))<1e-14,"matched classical ablation");
 std::cout<<"{\"nativeTests\":7,\"qubits\":1000,\"components\":1,\"maxObservableError\":"<<maximum_error
 <<",\"maxGradientError\":"<<maximum_gradient_error<<",\"unseenLossBefore\":"<<loss_before<<",\"unseenLossAfter\":"<<loss_after
 <<",\"allRotationsLearned\":true,\"originalEtherParity\":true}\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
